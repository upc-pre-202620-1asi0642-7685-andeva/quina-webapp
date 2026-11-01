import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Medios de pago al contado (US07 crit. 4). */
export const CASH_PAYMENT_METHODS = ['CASH', 'YAPE', 'PLIN', 'CARD'] as const;
export type CashPaymentMethod = (typeof CASH_PAYMENT_METHODS)[number];

export type CashPayment = {
  method: CashPaymentMethod;
  /** Solo en efectivo y si se ingresó; `null` si no. */
  amountReceived: Money | null;
  changeGiven: Money | null;
};

export type CashPaymentError = 'RECEIVED_INVALID' | 'RECEIVED_TOO_LOW';

const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Cobro al contado (US07 crit. 3): en efectivo el vuelto es lo recibido menos el
 * total; dejar vacío lo recibido vale como pago exacto. Yape, Plin y tarjeta no
 * llevan vuelto.
 */
export function settleCashPayment(
  total: Money,
  method: CashPaymentMethod,
  receivedRaw: string,
): Result<CashPayment, CashPaymentError> {
  const raw = receivedRaw.replace(/[\s,]/g, '').replace(/^S\/\.?/i, '');
  if (method !== 'CASH' || raw === '') {
    return ok({ method, amountReceived: null, changeGiven: null });
  }
  if (!AMOUNT.test(raw)) return err('RECEIVED_INVALID');
  const received = Money.of(raw, 'PEN');
  if (received.compare(total) < 0) return err('RECEIVED_TOO_LOW');
  return ok({ method, amountReceived: received, changeGiven: received.minus(total) });
}
