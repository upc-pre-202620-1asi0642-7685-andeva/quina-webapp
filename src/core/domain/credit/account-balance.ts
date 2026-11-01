import type { CycleSettlement } from '@/core/domain/credit/cycle-settlement';
import { payableLines, type PaymentAllocation } from '@/core/domain/credit/debt-payment';
import { Money } from '@/core/domain/shared/money';

/**
 * Deuda que consume el límite (`credit_accounts.current_balance`): capital de
 * los cargos de pago único sin pagar, capital original pendiente de las cuotas
 * e intereses ya liquidados sin pagar. La mora nunca entra: se calcula y se
 * paga en el mismo cobro.
 *
 * La venta en cuotas suma el capital original P (Plan 3), pero las filas de
 * `credit_installments` amortizan el capital capitalizado S_cap. Por eso cada
 * cuota libera solo su parte de P y el resto de la cuota es interés liquidado
 * (Plan 4, D3).
 */

/**
 * Capital original que libera cada cuota: P · amortización_k / S_cap, truncado
 * a céntimos; la última absorbe el residuo, así la suma es exactamente P. Se
 * recalcula siempre desde las filas guardadas, así el corte y el pago coinciden.
 */
export function capitalReleases(
  principal: Money,
  capitalizedAmount: Money,
  amortizations: readonly Money[],
): Money[] {
  const total = Money.sum(amortizations, principal.currency);
  if (!total.equals(capitalizedAmount)) {
    throw new RangeError('Las amortizaciones no suman el capital capitalizado');
  }
  return principal.allocate(amortizations);
}

/**
 * Lo que sube la deuda en el corte: el interés compensatorio de las compras no
 * anuladas y, de cada cuota del ciclo, lo que excede al capital que libera.
 */
export function cutOffBalanceIncrease(
  settlement: CycleSettlement,
  releaseOf: (installmentId: string) => Money,
): Money {
  const currency = settlement.totalDue.currency;
  return Money.sum(
    payableLines(settlement).map((line) =>
      line.kind === 'PURCHASE' ? line.interest : line.amount.minus(releaseOf(line.installmentId)),
    ),
    currency,
  );
}

/** Lo que baja la deuda al cobrar: todo lo pagado menos la mora. */
export function paymentBalanceDecrease(allocation: PaymentAllocation): Money {
  return allocation.principalPaid.plus(allocation.compensatoryInterestPaid);
}
