import { Dec } from '@/core/domain/shared/decimal';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type RateType = 'EFFECTIVE' | 'NOMINAL';
export type RatePeriod = 'ANNUAL' | 'MONTHLY' | 'DAILY';

/** Tasa tal como se pacta y se guarda (`credit_accounts`, `credit_charges`). */
export type RateInput = {
  type: RateType;
  /** Fracción en texto, como `NUMERIC(7, 4)`: `'0.2000'` es 20 %. */
  value: string;
  period: RatePeriod;
  capitalization: RatePeriod | null;
};

export type RateError =
  | 'RATE_VALUE_INVALID'
  | 'NEGATIVE_RATE'
  | 'NOMINAL_NEEDS_CAPITALIZATION'
  | 'EFFECTIVE_HAS_CAPITALIZATION'
  | 'CAPITALIZATION_LONGER_THAN_PERIOD';

/** Días de cada periodo en año comercial. */
const PERIOD_DAYS: Record<RatePeriod, number> = { ANNUAL: 360, MONTHLY: 30, DAILY: 1 };

const NUMBER = /^\d+(\.\d+)?$/;
const ONE = new Dec(1);

/**
 * Tasa compensatoria o moratoria. Toda tasa se lleva a su TEA y desde ella se
 * obtienen la tasa diaria (intereses por días) y la mensual (método francés):
 *
 * - Efectiva de periodo P: TEA = (1 + r)^(360 / días P) − 1
 * - Nominal de periodo P capitalizable cada C: m = días P / días C,
 *   TEA = (1 + r / m)^(360 / días C) − 1
 * - i_d = (1 + TEA)^(1/360) − 1 y TEM = (1 + TEA)^(30/360) − 1
 */
export class Rate {
  private constructor(
    readonly input: Readonly<RateInput>,
    private readonly teaValue: Dec,
  ) {}

  static parse(input: RateInput): Result<Rate, RateError> {
    const raw = input.value.trim();
    if (raw.startsWith('-')) return err('NEGATIVE_RATE');
    if (!NUMBER.test(raw)) return err('RATE_VALUE_INVALID');
    const value = new Dec(raw);
    const periodDays = PERIOD_DAYS[input.period];

    if (input.type === 'EFFECTIVE') {
      if (input.capitalization !== null) return err('EFFECTIVE_HAS_CAPITALIZATION');
      const tea = ONE.plus(value).pow(new Dec(360).dividedBy(periodDays)).minus(1);
      return ok(new Rate(Object.freeze({ ...input }), tea));
    }

    if (input.capitalization === null) return err('NOMINAL_NEEDS_CAPITALIZATION');
    const capitalizationDays = PERIOD_DAYS[input.capitalization];
    if (capitalizationDays > periodDays) return err('CAPITALIZATION_LONGER_THAN_PERIOD');
    const perCapitalization = value.dividedBy(periodDays / capitalizationDays);
    const tea = ONE.plus(perCapitalization)
      .pow(new Dec(360).dividedBy(capitalizationDays))
      .minus(1);
    return ok(new Rate(Object.freeze({ ...input }), tea));
  }

  /** Para tasas que ya vienen validadas (por ejemplo, copias guardadas en un cargo). */
  static of(input: RateInput): Rate {
    const result = Rate.parse(input);
    if (!result.ok) throw new RangeError(`Tasa inválida: ${result.error}`);
    return result.value;
  }

  /** Tasa efectiva anual: es la que se compara con los topes del BCRP (US06). */
  tea(): Dec {
    return this.teaValue;
  }

  /** Tasa efectiva diaria i_d. */
  daily(): Dec {
    return this.periodRate(1);
  }

  /** Tasa efectiva mensual (TEM) del método francés. */
  monthly(): Dec {
    return this.periodRate(30);
  }

  /** Factor de capitalización por `days` días: (1 + i_d)^días. */
  compoundFactor(days: number): Dec {
    if (days <= 0) return ONE;
    return ONE.plus(this.teaValue).pow(new Dec(days).dividedBy(360));
  }

  isZero(): boolean {
    return this.teaValue.isZero();
  }

  private periodRate(days: number): Dec {
    return this.compoundFactor(days).minus(1);
  }
}
