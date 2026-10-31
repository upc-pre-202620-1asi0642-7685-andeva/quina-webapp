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
  /** Tasa moratoria que se aplica al ciclo. */
  moratoryRate: Rate;
};

export type PaymentQuote = {
  readonly cycleId: string;
  readonly daysLate: number;
  readonly totalDue: Money;
  readonly moratoryInterest: Money;
  /** totalDue + moratoryInterest: lo único que se acepta como pago. */
  readonly amountDue: Money;
};

export type PaymentQuoteError = 'CYCLE_NOT_BILLED' | 'CYCLE_ALREADY_PAID';

/**
 * Monto a pagar por un ciclo en un instante dado (cálculo de US13). A tiempo
 * se paga lo liquidado en el corte, sin recalcular (crit. 1). Con atraso,
 * días_mora = días 30/360 entre la fecha pactada y el día de Lima del pago, y
 * la mora es totalDue · ((1 + i_d,mor)^días − 1) (crit. 2 y 3). Durante la
 * mora no corre interés compensatorio y las cuotas futuras no entran en la base.
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
  const moratoryInterest = interestForDays(cycle.totalDue, cycle.moratoryRate, daysLate);
  return ok(
    Object.freeze({
      cycleId: cycle.id,
      daysLate,
      totalDue: cycle.totalDue,
      moratoryInterest,
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

export type AllocationError = 'SETTLEMENT_MISMATCH' | 'ADJUSTMENTS_ALLOCATION_PENDING';

type Payable = Exclude<SettlementLine, { kind: 'VOID' }>;

/**
 * Reparte el pago entre los cargos y las cuotas del ciclo (crit. 5 y 7): cada
 * uno cancela su capital y su interés compensatorio, y la mora se reparte en
 * proporción a lo exigible de cada uno; la última línea absorbe el céntimo de
 * redondeo, así la mora repartida suma exactamente la mora total.
 */
export function allocatePayment(
  settlement: CycleSettlement,
  quote: PaymentQuote,
): Result<PaymentAllocation, AllocationError> {
  if (!settlement.totalDue.equals(quote.totalDue)) return err('SETTLEMENT_MISMATCH');
  // Cómo se reflejan las anulaciones en el desglose se define en el Plan 4.
  if (!settlement.adjustmentsTotal.isZero()) return err('ADJUSTMENTS_ALLOCATION_PENDING');

  const currency = quote.amountDue.currency;
  const items = settlement.lines.filter((l): l is Payable => l.kind !== 'VOID');
  const target = (line: Payable): AllocationTarget =>
    line.kind === 'PURCHASE'
      ? { kind: 'CHARGE', chargeId: line.chargeId }
      : { kind: 'INSTALLMENT', installmentId: line.installmentId };

  const moratoryShares = quote.moratoryInterest.isZero()
    ? items.map(() => Money.zero(currency))
    : quote.moratoryInterest.allocate(items.map((l) => l.amount));

  const rows: AllocationRow[] = items.flatMap((line, index) =>
    (
      [
        ['PRINCIPAL', line.principal],
        ['COMPENSATORY_INTEREST', line.interest],
        ['MORATORY_INTEREST', moratoryShares[index]!],
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
