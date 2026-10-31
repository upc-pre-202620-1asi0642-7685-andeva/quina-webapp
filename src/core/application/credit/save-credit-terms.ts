import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { CreditLimit, type CreditLimitError } from '@/core/domain/credit/credit-limit';
import { CreditTerms, type CreditTermsError } from '@/core/domain/credit/credit-terms';
import { CUSTOMER_PRIVACY_VERSION } from '@/core/domain/credit/customer-consent';
import { RateCaps, type RateCapError } from '@/core/domain/credit/rate-cap';
import { RatePercent } from '@/core/domain/credit/rate-percent';
import type { RateInput, RatePeriod, RateType } from '@/core/domain/finance/rate';
import type {
  CreditAccountRepository,
  OpenAccountGuard,
  SaveTermsResult,
} from '@/core/domain/ports/credit-account-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import type { Currency } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Tasa como la escribe el dueño: porcentaje en texto. */
export type RatePercentInput = {
  type: RateType;
  percent: string;
  period: RatePeriod;
  capitalization: RatePeriod | null;
};

export type SaveCreditTermsCommand = {
  storeId: string;
  actorId: string;
  customerId: string;
  currency: Currency;
  creditLimit: string;
  compensatory: RatePercentInput;
  moratory: RatePercentInput;
  cutOffDay: number;
  paymentDueDay: number;
  maxInstallmentMonths: number;
  /** Resumen de las condiciones que vio el dueño: evidencia `CREDIT_TERMS`. */
  consentText: string;
  ip: string;
  userAgent: string;
  now: Date;
};

export type SaveCreditTermsError =
  | CreditLimitError
  | CreditTermsError
  | RateCapError
  | 'COMPENSATORY_PERCENT_INVALID'
  | 'MORATORY_PERCENT_INVALID'
  | Exclude<SaveTermsResult, 'OPENED' | 'UPDATED'>;

/** US26 crit. 2 y 3: solo cuentan las cuentas de crédito activas. */
export function activeAccountGuard(now: Date): OpenAccountGuard {
  return (subscription, activeAccounts) =>
    PlanLimits.canAdd(
      PlanLimits.effectiveTier(subscription, now),
      'activeCreditCustomers',
      activeAccounts,
    );
}

export class SaveCreditTermsUseCase {
  constructor(private readonly accounts: CreditAccountRepository) {}

  async execute(
    command: SaveCreditTermsCommand,
  ): Promise<Result<'OPENED' | 'UPDATED', SaveCreditTermsError>> {
    const limit = CreditLimit.parse(command.creditLimit, command.currency);
    if (!limit.ok) return limit;
    const compensatory = RatePercent.toFraction(command.compensatory.percent);
    if (!compensatory.ok) return err('COMPENSATORY_PERCENT_INVALID');
    const moratory = RatePercent.toFraction(command.moratory.percent);
    if (!moratory.ok) return err('MORATORY_PERCENT_INVALID');

    const input = {
      currency: command.currency,
      compensatory: toRate(command.compensatory, compensatory.value),
      moratory: toRate(command.moratory, moratory.value),
      cutOffDay: command.cutOffDay,
      paymentDueDay: command.paymentDueDay,
      maxInstallmentMonths: command.maxInstallmentMonths,
    };
    const terms = CreditTerms.create(input);
    if (!terms.ok) return terms;

    // US06 crit. 2: tope vigente del BCRP el día de Lima en que se pactan
    const caps = await this.accounts.rateCaps();
    const withinCaps = RateCaps.check(terms.value, caps, BusinessDate.fromInstant(command.now));
    if (!withinCaps.ok) return withinCaps;

    const result = await this.accounts.saveTerms({
      storeId: command.storeId,
      actorId: command.actorId,
      customerId: command.customerId,
      terms: { ...input, creditLimit: limit.value.toFixed2() },
      consent: {
        type: 'CREDIT_TERMS',
        version: CUSTOMER_PRIVACY_VERSION,
        text: command.consentText,
        ip: command.ip,
        userAgent: command.userAgent,
      },
      canOpen: activeAccountGuard(command.now),
      now: command.now,
    });
    return result === 'OPENED' || result === 'UPDATED' ? ok(result) : err(result);
  }
}

function toRate(input: RatePercentInput, value: string): RateInput {
  return {
    type: input.type,
    value,
    period: input.period,
    // La tasa efectiva no lleva capitalización (Rate.parse la rechazaría)
    capitalization: input.type === 'EFFECTIVE' ? null : input.capitalization,
  };
}

export class SetCreditAccountStatusUseCase {
  constructor(private readonly accounts: CreditAccountRepository) {}

  /** Reactivar ocupa un cupo del plan otra vez (US26 crit. 3). */
  async execute(command: {
    storeId: string;
    actorId: string;
    customerId: string;
    status: 'ACTIVE' | 'SUSPENDED';
    now: Date;
  }): Promise<Result<void, 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'>> {
    const result = await this.accounts.setStatus({
      ...command,
      canOpen: activeAccountGuard(command.now),
    });
    return result === 'OK' ? ok(undefined) : err(result);
  }
}
