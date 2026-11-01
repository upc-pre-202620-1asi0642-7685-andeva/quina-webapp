import type { CycleSettlement, SettlementLine } from '@/core/domain/credit/cycle-settlement';
import { days30360 } from '@/core/domain/finance/day-count';
import { interestForDays } from '@/core/domain/finance/interest';
import type { Rate } from '@/core/domain/finance/rate';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type CycleStatus = 'OPEN' | 'BILLED' | 'PAID' | 'OVERDUE';

/** Lo que el cobro necesita saber de un ciclo (`settlement_cycles`). */
export type PayableCycle = {
  id: string;
  status: CycleStatus;
  cutOffDate: BusinessDate;
  paymentDueDate: BusinessDate;
  /** Total exigible liquidado en el corte. */
  totalDue: Money;
  /** Exigible de cada cargo o cuota con su tasa moratoria congelada (decisión P1). */
  moratoryBases: readonly MoratoryBase[];
};

/** Parte exigible de una línea del ciclo y la tasa moratoria que congeló. */
export type MoratoryBase = {
  readonly lineId: string;
  readonly amount: Money;
  readonly moratoryRate: Rate;
};

/** Mora de una línea, para el desglose del recibo. */
export type LineMoratory = { readonly lineId: string; readonly amount: Money };

export type PaymentQuote = {
  readonly cycleId: string;
  readonly daysLate: number;
  readonly totalDue: Money;
  readonly moratoryInterest: Money;
  /** Mora de cada línea; su suma es moratoryInterest. */
  readonly moratoryByLine: readonly LineMoratory[];
  /** totalDue + moratoryInterest: lo único que se acepta como pago. */
  readonly amountDue: Money;
};

export type PaymentQuoteError =
  'CYCLE_NOT_BILLED' | 'CYCLE_ALREADY_PAID' | 'MORATORY_BASE_MISMATCH';

/**
 * Monto a pagar por un ciclo en un instante dado (cálculo de US13). A tiempo
 * se paga lo liquidado en el corte, sin recalcular (crit. 1). Con atraso,
 * días_mora = días 30/360 entre la fecha pactada y el día de Lima del pago, y
 * cada línea exigible paga base · ((1 + i_d,mor)^días − 1) con su propia tasa
 * moratoria congelada, y la mora del ciclo es la suma (crit. 2 y 3, decisión
 * P1). Durante la mora no corre interés compensatorio y las cuotas futuras no
 * entran en la base.
 */
export function quotePayment(
  cycle: PayableCycle,
  paymentInstant: Date,
): Result<PaymentQuote, PaymentQuoteError> {
  if (cycle.status === 'OPEN') return err('CYCLE_NOT_BILLED');
  if (cycle.status === 'PAID') return err('CYCLE_ALREADY_PAID');

  const daysLate = Math.max(
    0,
    days30360(cycle.paymentDueDate, BusinessDate.fromInstant(paymentInstant)),
  );
  const currency = cycle.totalDue.currency;
  const baseTotal = Money.sum(
    cycle.moratoryBases.map((b) => b.amount),
    currency,
  );
  if (!baseTotal.equals(cycle.totalDue)) return err('MORATORY_BASE_MISMATCH');

  const moratoryByLine = cycle.moratoryBases.map((b) =>
    Object.freeze({
      lineId: b.lineId,
      amount: interestForDays(b.amount, b.moratoryRate, daysLate),
    }),
  );
  const moratoryInterest = Money.sum(
    moratoryByLine.map((m) => m.amount),
    currency,
  );
  return ok(
    Object.freeze({
      cycleId: cycle.id,
      daysLate,
      totalDue: cycle.totalDue,
      moratoryInterest,
      moratoryByLine: Object.freeze(moratoryByLine),
      amountDue: cycle.totalDue.plus(moratoryInterest),
    }),
  );
}

export type PaymentAmountError =
  'PARTIAL_PAYMENT_NOT_ALLOWED' | 'AMOUNT_EXCEEDS_DUE' | 'CURRENCY_MISMATCH';

/** No hay pagos parciales: el vecino paga el ciclo completo (enunciado, punto 5; crit. 4). */
export function validatePaymentAmount(
  quote: PaymentQuote,
  amount: Money,
): Result<void, PaymentAmountError> {
  if (amount.currency !== quote.amountDue.currency) return err('CURRENCY_MISMATCH');
  const comparison = amount.compare(quote.amountDue);
  if (comparison < 0) return err('PARTIAL_PAYMENT_NOT_ALLOWED');
  if (comparison > 0) return err('AMOUNT_EXCEEDS_DUE');
  return ok(undefined);
}

/** Con varios ciclos por pagar se cancela primero el más antiguo (crit. 8). */
export function oldestPayableCycle<T extends Pick<PayableCycle, 'status' | 'cutOffDate'>>(
  cycles: readonly T[],
): T | null {
  return (
    cycles
      .filter((c) => c.status === 'BILLED' || c.status === 'OVERDUE')
      .sort((a, b) => BusinessDate.compare(a.cutOffDate, b.cutOffDate))[0] ?? null
  );
}

export type AllocationTarget =
  | { readonly kind: 'CHARGE'; readonly chargeId: string }
  | { readonly kind: 'INSTALLMENT'; readonly installmentId: string };

export type AllocationType = 'PRINCIPAL' | 'COMPENSATORY_INTEREST' | 'MORATORY_INTEREST';

/** Fila de `payment_allocations`. */
export type AllocationRow = {
  readonly target: AllocationTarget;
  readonly type: AllocationType;
  readonly amount: Money;
};

/** Desglose del pago (`debt_payments`): amountPaid = principal + compensatorio + moratorio. */
export type PaymentAllocation = {
  readonly rows: readonly AllocationRow[];
  readonly principalPaid: Money;
  readonly compensatoryInterestPaid: Money;
  readonly moratoryInterestPaid: Money;
  readonly amountPaid: Money;
};

export type AllocationError = 'SETTLEMENT_MISMATCH';

type Payable = Exclude<SettlementLine, { kind: 'VOID' }>;

/** Identificador estable de una línea exigible: `charge:<id>` o `installment:<id>`. */
export function lineIdOf(line: Payable): string {
  return line.kind === 'PURCHASE' ? `charge:${line.chargeId}` : `installment:${line.installmentId}`;
}

/** Líneas que se cobran: compras no anuladas y cuotas del mes. */
export function payableLines(settlement: CycleSettlement): Payable[] {
  const voided = new Set(settlement.lines.filter((l) => l.kind === 'VOID').map((l) => l.chargeId));
  return settlement.lines.filter(
    (l): l is Payable =>
      l.kind === 'INSTALLMENT' || (l.kind === 'PURCHASE' && !voided.has(l.chargeId)),
  );
}

/** Bases de la mora del ciclo, cada una con la tasa moratoria que congeló su cargo. */
export function moratoryBasesOf(
  settlement: CycleSettlement,
  rateOf: (lineId: string, line: Payable) => Rate,
): MoratoryBase[] {
  return payableLines(settlement).map((line) => {
    const lineId = lineIdOf(line);
    return Object.freeze({ lineId, amount: line.amount, moratoryRate: rateOf(lineId, line) });
  });
}

/**
 * Reparte el pago entre los cargos y las cuotas del ciclo (crit. 5 y 7): cada
 * uno cancela su capital, su interés compensatorio y su propia mora (decisión
 * P1). Las compras anuladas en el ciclo no se cobran (decisión P2).
 */
export function allocatePayment(
  settlement: CycleSettlement,
  quote: PaymentQuote,
): Result<PaymentAllocation, AllocationError> {
  if (!settlement.totalDue.equals(quote.totalDue)) return err('SETTLEMENT_MISMATCH');

  const currency = quote.amountDue.currency;
  const items = payableLines(settlement);
  const moratoryOf = new Map(quote.moratoryByLine.map((m) => [m.lineId, m.amount]));
  if (items.length !== moratoryOf.size || items.some((line) => !moratoryOf.has(lineIdOf(line)))) {
    return err('SETTLEMENT_MISMATCH');
  }
  const target = (line: Payable): AllocationTarget =>
    line.kind === 'PURCHASE'
      ? { kind: 'CHARGE', chargeId: line.chargeId }
      : { kind: 'INSTALLMENT', installmentId: line.installmentId };

  const rows: AllocationRow[] = items.flatMap((line) =>
    (
      [
        ['PRINCIPAL', line.principal],
        ['COMPENSATORY_INTEREST', line.interest],
        ['MORATORY_INTEREST', moratoryOf.get(lineIdOf(line)) ?? Money.zero(currency)],
      ] as const
    )
      .filter(([, amount]) => amount.isPositive())
      .map(([type, amount]) => Object.freeze({ target: target(line), type, amount })),
  );

  const total = (type: AllocationType) =>
    Money.sum(
      rows.filter((r) => r.type === type).map((r) => r.amount),
      currency,
    );
  const principalPaid = total('PRINCIPAL');
  const compensatoryInterestPaid = total('COMPENSATORY_INTEREST');
  const moratoryInterestPaid = total('MORATORY_INTEREST');

  return ok(
    Object.freeze({
      rows: Object.freeze(rows),
      principalPaid,
      compensatoryInterestPaid,
      moratoryInterestPaid,
      amountPaid: principalPaid.plus(compensatoryInterestPaid).plus(moratoryInterestPaid),
    }),
  );
}
