import { Rate, type RateError, type RateInput } from '@/core/domain/finance/rate';
import type { Currency } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Condiciones pactadas con un vecino (`credit_accounts`), tal como se guardan. */
export type CreditTermsInput = {
  currency: Currency;
  compensatory: RateInput;
  moratory: RateInput;
  cutOffDay: number;
  paymentDueDay: number;
  maxInstallmentMonths: number;
};

/** Copia validada de las condiciones; cada cargo congela la suya (US06 crit. 6). */
export type CreditTerms = {
  readonly currency: Currency;
  readonly compensatory: Rate;
  readonly moratory: Rate;
  readonly cutOffDay: number;
  readonly paymentDueDay: number;
  readonly maxInstallmentMonths: number;
};

export type CreditTermsError =
  | 'CUT_OFF_DAY_OUT_OF_RANGE'
  | 'PAYMENT_DUE_DAY_OUT_OF_RANGE'
  | 'MAX_INSTALLMENT_MONTHS_OUT_OF_RANGE'
  | `COMPENSATORY_${RateError}`
  | `MORATORY_${RateError}`;

export const MAX_INSTALLMENTS = 24;

const isDayOfMonth = (day: number) => Number.isInteger(day) && day >= 1 && day <= 28;

export const CreditTerms = {
  create(input: CreditTermsInput): Result<CreditTerms, CreditTermsError> {
    if (!isDayOfMonth(input.cutOffDay)) return err('CUT_OFF_DAY_OUT_OF_RANGE');
    if (!isDayOfMonth(input.paymentDueDay)) return err('PAYMENT_DUE_DAY_OUT_OF_RANGE');
    if (
      !Number.isInteger(input.maxInstallmentMonths) ||
      input.maxInstallmentMonths < 1 ||
      input.maxInstallmentMonths > MAX_INSTALLMENTS
    ) {
      return err('MAX_INSTALLMENT_MONTHS_OUT_OF_RANGE');
    }
    const compensatory = Rate.parse(input.compensatory);
    if (!compensatory.ok) return err(`COMPENSATORY_${compensatory.error}` as const);
    const moratory = Rate.parse(input.moratory);
    if (!moratory.ok) return err(`MORATORY_${moratory.error}` as const);

    return ok(
      Object.freeze({
        currency: input.currency,
        compensatory: compensatory.value,
        moratory: moratory.value,
        cutOffDay: input.cutOffDay,
        paymentDueDay: input.paymentDueDay,
        maxInstallmentMonths: input.maxInstallmentMonths,
      }),
    );
  },

  /** Para condiciones que ya vienen validadas de la base de datos. */
  of(input: CreditTermsInput): CreditTerms {
    const result = CreditTerms.create(input);
    if (!result.ok) throw new RangeError(`Condiciones inválidas: ${result.error}`);
    return result.value;
  },
};
