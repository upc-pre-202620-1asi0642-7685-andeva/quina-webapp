import { cycleContains, type BillingCycle } from '@/core/domain/credit/billing-cycle';
import { days30360 } from '@/core/domain/finance/day-count';
import { interestForDays } from '@/core/domain/finance/interest';
import type { Rate } from '@/core/domain/finance/rate';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Cargo de pago único del ciclo, con la tasa compensatoria que congeló al comprar. */
export type SingleChargeInput = {
  id: string;
  principal: Money;
  purchaseInstant: Date;
  compensatoryRate: Rate;
};

/** Cuota francesa que vence en la fecha de pago del ciclo. */
export type DueInstallmentInput = {
  id: string;
  chargeId: string;
  number: number;
  totalInstallments: number;
  dueDate: BusinessDate;
  principal: Money;
  interest: Money;
};

/**
 * Cargo de pago único de este mismo ciclo que el dueño anuló (`credit_charge_voids`).
 * Se descuenta su línea completa, capital más interés (Plan 4, decisión P2).
 */
export type VoidInput = { chargeId: string };

export type SettlementLine =
  | {
      readonly kind: 'PURCHASE';
      readonly chargeId: string;
      readonly date: BusinessDate;
      readonly principal: Money;
      readonly days: number;
      readonly interest: Money;
      readonly amount: Money;
    }
  | {
      readonly kind: 'INSTALLMENT';
      readonly installmentId: string;
      readonly chargeId: string;
      readonly number: number;
      readonly totalInstallments: number;
      readonly date: BusinessDate;
      readonly principal: Money;
      readonly interest: Money;
      readonly amount: Money;
    }
  | {
      readonly kind: 'VOID';
      readonly chargeId: string;
      readonly principal: Money;
      readonly interest: Money;
      readonly amount: Money;
    };

export type CycleSettlement = {
  readonly lines: readonly SettlementLine[];
  /** Capital de los cargos de pago único (`purchases_total`). */
  readonly purchasesTotal: Money;
  /** Solo el interés de los cargos de pago único; el de las cuotas va dentro de ellas. */
  readonly compensatoryInterestTotal: Money;
  /** Cuotas completas que vencen en el ciclo (`installments_total`). */
  readonly installmentsTotal: Money;
  readonly adjustmentsTotal: Money;
  /** purchasesTotal + compensatoryInterestTotal + installmentsTotal − adjustmentsTotal. */
  readonly totalDue: Money;
};

export type SettlementError =
  | 'CHARGE_OUTSIDE_CYCLE'
  | 'INSTALLMENT_OUTSIDE_CYCLE'
  | 'CURRENCY_MISMATCH'
  | 'VOID_OUTSIDE_CYCLE'
  | 'ADJUSTMENTS_EXCEED_DUE';

export type SettleCycleInput = {
  cycle: BillingCycle;
  currency: Currency;
  singleCharges: readonly SingleChargeInput[];
  dueInstallments: readonly DueInstallmentInput[];
  voids: readonly VoidInput[];
};

/**
 * Liquidación de un ciclo en su fecha de corte (cálculo de US10): cada compra
 * de pago único paga interés compensatorio por los días 30/360 entre la compra
 * y la fecha de pago; se suman las cuotas del mes y se descuentan las
 * anulaciones. Las líneas salen ordenadas: compras por fecha, luego cuotas y
 * al final anulaciones.
 */
export function settleCycle(input: SettleCycleInput): Result<CycleSettlement, SettlementError> {
  const { cycle, currency } = input;
  const amounts = [
    ...input.singleCharges.map((c) => c.principal),
    ...input.dueInstallments.flatMap((i) => [i.principal, i.interest]),
  ];
  if (amounts.some((m) => m.currency !== currency)) return err('CURRENCY_MISMATCH');
  if (input.singleCharges.some((c) => !cycleContains(cycle, c.purchaseInstant))) {
    return err('CHARGE_OUTSIDE_CYCLE');
  }
  if (
    input.dueInstallments.some((i) => BusinessDate.compare(i.dueDate, cycle.paymentDueDate) !== 0)
  ) {
    return err('INSTALLMENT_OUTSIDE_CYCLE');
  }

  const purchases = [...input.singleCharges]
    .sort((a, b) => a.purchaseInstant.getTime() - b.purchaseInstant.getTime())
    .map((charge): SettlementLine => {
      const date = BusinessDate.fromInstant(charge.purchaseInstant);
      const days = days30360(date, cycle.paymentDueDate);
      const interest = interestForDays(charge.principal, charge.compensatoryRate, days);
      return {
        kind: 'PURCHASE',
        chargeId: charge.id,
        date,
        principal: charge.principal,
        days,
        interest,
        amount: charge.principal.plus(interest),
      };
    });

  const installments = input.dueInstallments.map((i): SettlementLine => ({
    kind: 'INSTALLMENT',
    installmentId: i.id,
    chargeId: i.chargeId,
    number: i.number,
    totalInstallments: i.totalInstallments,
    date: i.dueDate,
    principal: i.principal,
    interest: i.interest,
    amount: i.principal.plus(i.interest),
  }));

  const voids: SettlementLine[] = [];
  for (const v of input.voids) {
    const purchase = purchases.find((l) => l.kind === 'PURCHASE' && l.chargeId === v.chargeId);
    if (!purchase) return err('VOID_OUTSIDE_CYCLE');
    voids.push({
      kind: 'VOID',
      chargeId: v.chargeId,
      principal: purchase.principal,
      interest: purchase.interest,
      amount: purchase.amount,
    });
  }

  const sum = (lines: readonly SettlementLine[], pick: (l: SettlementLine) => Money) =>
    Money.sum(lines.map(pick), currency);

  const purchasesTotal = sum(purchases, (l) => l.principal);
  const compensatoryInterestTotal = sum(purchases, (l) => l.interest);
  const installmentsTotal = sum(installments, (l) => l.amount);
  const adjustmentsTotal = sum(voids, (l) => l.amount);
  const totalDue = purchasesTotal
    .plus(compensatoryInterestTotal)
    .plus(installmentsTotal)
    .minus(adjustmentsTotal);
  // Invariante: solo se anulan compras del propio ciclo, así nunca queda negativo.
  if (totalDue.isNegative()) return err('ADJUSTMENTS_EXCEED_DUE');

  return ok(
    Object.freeze({
      lines: Object.freeze([...purchases, ...installments, ...voids]),
      purchasesTotal,
      compensatoryInterestTotal,
      installmentsTotal,
      adjustmentsTotal,
      totalDue,
    }),
  );
}
