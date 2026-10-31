import { Money, type Currency } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type CreditLimitError = 'CREDIT_LIMIT_INVALID' | 'CREDIT_LIMIT_NOT_POSITIVE';

/** Hasta 10 enteros y 2 decimales: lo que cabe en `NUMERIC(12, 2)`. */
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

export const CreditLimit = {
  /** Límite de crédito del vecino (US06 crit. 3): un monto mayor que cero. */
  parse(raw: string, currency: Currency): Result<Money, CreditLimitError> {
    const clean = raw.replace(/[\s,]/g, '');
    if (!AMOUNT.test(clean)) return err('CREDIT_LIMIT_INVALID');
    const limit = Money.of(clean, currency);
    if (!limit.isPositive()) return err('CREDIT_LIMIT_NOT_POSITIVE');
    return ok(limit);
  },
};
