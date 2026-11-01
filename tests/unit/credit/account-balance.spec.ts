import { describe, expect, it } from 'vitest';
import {
  capitalReleases,
  cutOffBalanceIncrease,
  paymentBalanceDecrease,
} from '@/core/domain/credit/account-balance';
import { cycleClosingIn } from '@/core/domain/credit/billing-cycle';
import { CreditTerms, type CreditTermsInput } from '@/core/domain/credit/credit-terms';
import { settleCycle } from '@/core/domain/credit/cycle-settlement';
import { allocatePayment, moratoryBasesOf, quotePayment } from '@/core/domain/credit/debt-payment';
import { planInstallments } from '@/core/domain/credit/installment-plan';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { datasets } from '../finance/fixtures/datasets';

const pen = (amount: string) => Money.of(amount, 'PEN');

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('capitalReleases (D3)', () => {
  it('reparte el capital original en proporción a la amortización y suma exacto', () => {
    const releases = capitalReleases(pen('100.00'), pen('103.00'), [
      pen('34.00'),
      pen('34.00'),
      pen('35.00'),
    ]);
    expect(releases.map((r) => r.toFixed2())).toEqual(['33.00', '33.00', '34.00']);
    expect(Money.sum(releases, 'PEN').toFixed2()).toBe('100.00');
  });
});

describe('saldo de la cuenta en el ciclo de vida de una compra en cuotas (D3b)', () => {
  it.each(datasets.map((ds) => [ds.title, ds] as const))(
    '%s: la venta, los cortes y los pagos dejan el saldo exactamente en cero',
    (_title, ds) => {
      const terms = CreditTerms.of(ds.terms as CreditTermsInput);
      const principal = pen('120.00');
      const plan = unwrap(
        planInstallments({
          principal,
          purchaseInstant: new Date(ds.installmentPurchase.purchaseInstant),
          terms,
          installments: 3,
        }),
      );
      const releases = capitalReleases(
        principal,
        plan.capitalizedAmount,
        plan.rows.map((r) => r.principal),
      );

      let balance = principal; // la venta suma el capital (Plan 3)
      for (const [index, row] of plan.rows.entries()) {
        // Corte 20 y pago 26: la cuota vence en el ciclo que cierra su mismo mes.
        const cycle = cycleClosingIn(row.dueDate.year, row.dueDate.month, terms);
        expect(BusinessDate.compare(cycle.paymentDueDate, row.dueDate)).toBe(0);
        const settlement = unwrap(
          settleCycle({
            cycle,
            currency: 'PEN',
            singleCharges: [],
            dueInstallments: [
              {
                id: `i${index}`,
                chargeId: 'c',
                number: row.number,
                totalInstallments: 3,
                dueDate: row.dueDate,
                principal: row.principal,
                interest: row.interest,
              },
            ],
            voids: [],
          }),
        );
        balance = balance.plus(cutOffBalanceIncrease(settlement, () => releases[index]!));
        expect(balance.isNegative()).toBe(false);

        const quote = unwrap(
          quotePayment(
            {
              id: 'cy',
              status: 'BILLED',
              cutOffDate: cycle.cutOffDate,
              paymentDueDate: cycle.paymentDueDate,
              totalDue: settlement.totalDue,
              moratoryBases: moratoryBasesOf(settlement, () => terms.moratory),
            },
            BusinessDate.endInstant(cycle.paymentDueDate),
          ),
        );
        balance = balance.minus(paymentBalanceDecrease(unwrap(allocatePayment(settlement, quote))));
        expect(balance.isNegative()).toBe(false);
      }
      expect(balance.isZero()).toBe(true);
    },
  );

  it('un pago con mora no descuenta la mora del saldo (nunca se sumó)', () => {
    const ds = datasets[0]!;
    const terms = CreditTerms.of(ds.terms as CreditTermsInput);
    const cycle = cycleClosingIn(2026, 9, terms);
    const settlement = unwrap(
      settleCycle({
        cycle,
        currency: 'PEN',
        singleCharges: ds.singlePaymentCycle.charges.map((c) => ({
          id: c.id,
          principal: pen(c.principal),
          purchaseInstant: new Date(c.purchaseInstant),
          compensatoryRate: terms.compensatory,
        })),
        dueInstallments: [],
        voids: [],
      }),
    );
    const increase = cutOffBalanceIncrease(settlement, () => Money.zero('PEN'));
    expect(increase.toFixed2()).toBe(ds.singlePaymentCycle.compensatoryInterestTotal);

    const quote = unwrap(
      quotePayment(
        {
          id: 'cy',
          status: 'OVERDUE',
          cutOffDate: cycle.cutOffDate,
          paymentDueDate: cycle.paymentDueDate,
          totalDue: settlement.totalDue,
          moratoryBases: moratoryBasesOf(settlement, () => terms.moratory),
        },
        new Date(ds.singlePaymentCycle.latePayment.paymentInstant),
      ),
    );
    const decrease = paymentBalanceDecrease(unwrap(allocatePayment(settlement, quote)));
    expect(decrease.toFixed2()).toBe(ds.singlePaymentCycle.totalDue);
  });

  it('una compra anulada en el ciclo no suma interés al saldo', () => {
    const ds = datasets[0]!;
    const terms = CreditTerms.of(ds.terms as CreditTermsInput);
    const settlement = unwrap(
      settleCycle({
        cycle: cycleClosingIn(2026, 9, terms),
        currency: 'PEN',
        singleCharges: ds.singlePaymentCycle.charges.map((c) => ({
          id: c.id,
          principal: pen(c.principal),
          purchaseInstant: new Date(c.purchaseInstant),
          compensatoryRate: terms.compensatory,
        })),
        dueInstallments: [],
        voids: [{ chargeId: 'charge-1' }],
      }),
    );
    const charge1 = ds.singlePaymentCycle.charges.find((c) => c.id === 'charge-1')!;
    const expected = pen(ds.singlePaymentCycle.compensatoryInterestTotal).minus(
      pen(charge1.interest),
    );
    expect(cutOffBalanceIncrease(settlement, () => Money.zero('PEN')).equals(expected)).toBe(true);
  });
});
