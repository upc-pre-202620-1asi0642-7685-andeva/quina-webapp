import type { Rate } from '@/core/domain/finance/rate';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Dec } from '@/core/domain/shared/decimal';
import { Money } from '@/core/domain/shared/money';

export type ScheduleRow = {
  readonly number: number;
  readonly dueDate: BusinessDate;
  readonly initialBalance: Money;
  readonly installment: Money;
  readonly interest: Money;
  readonly principal: Money;
  readonly finalBalance: Money;
};

export type FrenchSchedule = {
  readonly graceDays: number;
  /** Capital tras capitalizar la gracia (`credit_charges.capitalized_amount`). */
  readonly capitalizedAmount: Money;
  /** Cuota fija R; la última cuota puede diferir en céntimos porque cierra el saldo. */
  readonly installmentAmount: Money;
  readonly rows: readonly ScheduleRow[];
};

export type FrenchScheduleInput = {
  principal: Money;
  rate: Rate;
  graceDays: number;
  installments: number;
  /** Fecha de pago del ciclo de la compra; la cuota k vence k meses después. */
  cycleDueDate: BusinessDate;
};

/**
 * Método francés vencido ordinario con gracia total capitalizada (enunciado,
 * punto 4; US09):
 *
 * 1. S_cap = round(P · (1 + i_d)^gracia)
 * 2. R = round(S_cap · i(1 + i)^n / ((1 + i)^n − 1)), con i = TEM y S_cap ya redondeado
 * 3. Para cada cuota: interés = round(saldo · i) y amortización = R − interés;
 *    la última amortiza el saldo exacto, así Σ amortizaciones = S_cap.
 */
export const FrenchAmortizationCalculator = {
  schedule(input: FrenchScheduleInput): FrenchSchedule {
    const { principal, rate, graceDays, installments: n } = input;
    if (!Number.isInteger(n) || n < 1) throw new RangeError('El número de cuotas debe ser ≥ 1');
    if (!Number.isInteger(graceDays) || graceDays < 0) {
      throw new RangeError('Los días de gracia deben ser un entero ≥ 0');
    }

    const capitalizedAmount = principal.times(rate.compoundFactor(graceDays));
    const i = rate.monthly();
    const installmentAmount = i.isZero()
      ? capitalizedAmount.dividedBy(n)
      : capitalizedAmount.times(annuityFactor(i, n));

    const rows: ScheduleRow[] = [];
    let balance = capitalizedAmount;
    for (let number = 1; number <= n; number++) {
      const interest = balance.times(i);
      const amortization = number === n ? balance : installmentAmount.minus(interest);
      const finalBalance = balance.minus(amortization);
      rows.push(
        Object.freeze({
          number,
          dueDate: BusinessDate.addMonths(input.cycleDueDate, number),
          initialBalance: balance,
          installment: amortization.plus(interest),
          interest,
          principal: amortization,
          finalBalance,
        }),
      );
      balance = finalBalance;
    }

    return Object.freeze({ graceDays, capitalizedAmount, installmentAmount, rows });
  },
};

/** i(1 + i)^n / ((1 + i)^n − 1) */
function annuityFactor(i: Dec, n: number): Dec {
  const growth = new Dec(1).plus(i).pow(n);
  return i.times(growth).dividedBy(growth.minus(1));
}
