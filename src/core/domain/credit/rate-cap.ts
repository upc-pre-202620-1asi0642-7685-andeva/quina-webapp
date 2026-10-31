import type { CreditTerms } from '@/core/domain/credit/credit-terms';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Dec } from '@/core/domain/shared/decimal';
import type { Currency } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type RateKind = 'COMPENSATORY' | 'MORATORY';

/** Tope del BCRP para operaciones fuera del sistema financiero (`credit_rate_caps`). */
export type RateCap = {
  kind: RateKind;
  currency: Currency;
  /** TEA máxima como fracción en texto (`NUMERIC(7, 4)`). */
  maxEffectiveAnnualRate: string;
  validFrom: BusinessDate;
  /** `null` = rige hasta que se registre la vigencia siguiente. */
  validTo: BusinessDate | null;
};

export type RateCapError = `${RateKind}_RATE_ABOVE_CAP` | `${RateKind}_NO_CAP_IN_FORCE`;

const isInForce = (cap: RateCap, on: BusinessDate) =>
  BusinessDate.compare(cap.validFrom, on) <= 0 &&
  (cap.validTo === null || BusinessDate.compare(on, cap.validTo) <= 0);

export const RateCaps = {
  /** Tope vigente en `on`: la vigencia más reciente que ya empezó y no terminó. */
  inForce(
    caps: readonly RateCap[],
    kind: RateKind,
    currency: Currency,
    on: BusinessDate,
  ): RateCap | null {
    return (
      caps
        .filter((c) => c.kind === kind && c.currency === currency && isInForce(c, on))
        .sort((a, b) => BusinessDate.compare(b.validFrom, a.validFrom))[0] ?? null
    );
  },

  /**
   * US06 crit. 2: la TEA equivalente de cada tasa no puede pasar el tope vigente
   * de la moneda de la cuenta. Sin tope vigente se rechaza.
   */
  check(
    terms: CreditTerms,
    caps: readonly RateCap[],
    on: BusinessDate,
  ): Result<void, RateCapError> {
    const rates = [
      ['COMPENSATORY', terms.compensatory],
      ['MORATORY', terms.moratory],
    ] as const;
    for (const [kind, rate] of rates) {
      const cap = RateCaps.inForce(caps, kind, terms.currency, on);
      if (!cap) return err(`${kind}_NO_CAP_IN_FORCE` as const);
      if (rate.tea().greaterThan(new Dec(cap.maxEffectiveAnnualRate))) {
        return err(`${kind}_RATE_ABOVE_CAP` as const);
      }
    }
    return ok(undefined);
  },
};
