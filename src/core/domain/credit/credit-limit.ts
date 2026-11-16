import { Dec } from '@/core/domain/shared/decimal';
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

  /** Calcula el disponible y porcentaje usado con aritmética decimal exacta (sin `number` en montos). */
  usage(
    balanceRaw: string,
    limitRaw: string,
    currency: Currency,
  ): { availableCredit: string; overLimit: boolean; usedPercent: number } {
    const balance = Money.of(balanceRaw, currency);
    const limit = Money.of(limitRaw, currency);
    const diff = limit.minus(balance);
    const overLimit = diff.isNegative();
    const availableCredit = overLimit ? Money.zero(currency).toFixed2() : diff.toFixed2();
    const ratio = limit.isZero()
      ? 0
      : balance
          .decimal()
          .dividedBy(limit.decimal())
          .times(100)
          .toDecimalPlaces(0, Dec.ROUND_HALF_UP)
          .toNumber();
    const usedPercent = Math.min(100, Math.max(0, ratio));
    return { availableCredit, overLimit, usedPercent };
  },
};
