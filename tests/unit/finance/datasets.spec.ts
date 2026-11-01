import { describe, expect, it } from 'vitest';
import { cycleFor } from '@/core/domain/credit/billing-cycle';
import { CreditTerms, type CreditTermsInput } from '@/core/domain/credit/credit-terms';
import { settleCycle } from '@/core/domain/credit/cycle-settlement';
import {
  allocatePayment,
  moratoryBasesOf,
  quotePayment,
  validatePaymentAmount,
} from '@/core/domain/credit/debt-payment';
import { planInstallments } from '@/core/domain/credit/installment-plan';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { datasets } from './fixtures/datasets';

const pen = (amount: string) => Money.of(amount, 'PEN');
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

/**
 * Caja negra: cada juego de datos del informe recorre el motor de punta a
 * punta (compra en cuotas → cronograma; compras de pago único → corte → pago
 * con mora) y se compara con el oráculo independiente.
 */
describe.each(datasets.map((ds) => [ds.title, ds] as const))('%s', (_title, ds) => {
  const terms = CreditTerms.of(ds.terms as CreditTermsInput);

  it('cronograma de la compra en cuotas', () => {
    const expected = ds.installmentPurchase;
    const plan = unwrap(
      planInstallments({
        principal: pen(expected.principal),
        purchaseInstant: new Date(expected.purchaseInstant),
        terms,
        installments: expected.installments,
      }),
    );
    expect(plan.graceDays).toBe(expected.graceDays);
    expect(plan.capitalizedAmount.toFixed2()).toBe(expected.capitalizedAmount);
    expect(plan.installmentAmount.toFixed2()).toBe(expected.installmentAmount);
    expect(plan.rows.map((r) => r.installment.toFixed2())).toEqual(
      expected.rows.map((r) => r.installment),
    );
  });

  it('corte, liquidación y pago con 10 días de mora', () => {
    const expected = ds.singlePaymentCycle;
    const cycle = cycleFor(new Date(expected.charges[0]!.purchaseInstant), terms);
    expect(BusinessDate.toISO(cycle.cutOffDate)).toBe(expected.cutOffDate);
    expect(BusinessDate.toISO(cycle.paymentDueDate)).toBe(expected.paymentDueDate);

    const settlement = unwrap(
      settleCycle({
        cycle,
        currency: terms.currency,
        singleCharges: expected.charges.map((c) => ({
          id: c.id,
          principal: pen(c.principal),
          purchaseInstant: new Date(c.purchaseInstant),
          compensatoryRate: terms.compensatory,
        })),
        dueInstallments: [],
        voids: [],
      }),
    );
    expect(settlement.totalDue.toFixed2()).toBe(expected.totalDue);

    const late = expected.latePayment;
    const quote = unwrap(
      quotePayment(
        {
          id: 'cycle',
          status: 'OVERDUE',
          cutOffDate: cycle.cutOffDate,
          paymentDueDate: cycle.paymentDueDate,
          totalDue: settlement.totalDue,
          moratoryBases: moratoryBasesOf(settlement, () => terms.moratory),
        },
        new Date(late.paymentInstant),
      ),
    );
    expect(quote.amountDue.toFixed2()).toBe(late.amountDue);
    expect(validatePaymentAmount(quote, pen(late.amountDue)).ok).toBe(true);

    const allocation = unwrap(allocatePayment(settlement, quote));
    expect([
      allocation.principalPaid.toFixed2(),
      allocation.compensatoryInterestPaid.toFixed2(),
      allocation.moratoryInterestPaid.toFixed2(),
      allocation.amountPaid.toFixed2(),
    ]).toEqual([
      late.principalPaid,
      late.compensatoryInterestPaid,
      late.moratoryInterest,
      late.amountDue,
    ]);
  });
});
