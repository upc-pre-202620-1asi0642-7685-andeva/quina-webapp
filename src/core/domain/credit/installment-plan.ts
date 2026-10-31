import { cycleFor, type BillingCycle } from '@/core/domain/credit/billing-cycle';
import { MAX_INSTALLMENTS, type CreditTerms } from '@/core/domain/credit/credit-terms';
import { days30360 } from '@/core/domain/finance/day-count';
import {
  FrenchAmortizationCalculator,
  type FrenchSchedule,
} from '@/core/domain/finance/french-schedule';
import { BusinessDate } from '@/core/domain/shared/business-date';
import type { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type InstallmentPlanInput = {
  principal: Money;
  purchaseInstant: Date;
  terms: CreditTerms;
  installments: number;
};

export type InstallmentPlanError =
  | 'INSTALLMENTS_OUT_OF_RANGE'
  | 'EXCEEDS_MAX_INSTALLMENT_MONTHS'
  | 'PRINCIPAL_NOT_POSITIVE'
  | 'CURRENCY_MISMATCH';

export type InstallmentPlan = FrenchSchedule & { readonly cycle: BillingCycle };

/**
 * Cronograma de una compra en cuotas (US09): la gracia total va del día de la
 * compra a la fecha de pago del ciclo al que pertenece (30/360), y la primera
 * cuota vence un mes después de esa fecha.
 */
export function planInstallments(
  input: InstallmentPlanInput,
): Result<InstallmentPlan, InstallmentPlanError> {
  const { principal, terms, installments } = input;
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    return err('INSTALLMENTS_OUT_OF_RANGE');
  }
  if (installments > terms.maxInstallmentMonths) return err('EXCEEDS_MAX_INSTALLMENT_MONTHS');
  if (!principal.isPositive()) return err('PRINCIPAL_NOT_POSITIVE');
  if (principal.currency !== terms.currency) return err('CURRENCY_MISMATCH');

  const cycle = cycleFor(input.purchaseInstant, terms);
  const graceDays = days30360(
    BusinessDate.fromInstant(input.purchaseInstant),
    cycle.paymentDueDate,
  );
  const schedule = FrenchAmortizationCalculator.schedule({
    principal,
    rate: terms.compensatory,
    graceDays,
    installments,
    cycleDueDate: cycle.paymentDueDate,
  });
  return ok(Object.freeze({ ...schedule, cycle }));
}
