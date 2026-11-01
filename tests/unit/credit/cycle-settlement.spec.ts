import { describe, expect, it } from 'vitest';
import { cycleClosingIn } from '@/core/domain/credit/billing-cycle';
import { CreditTerms, type CreditTermsInput } from '@/core/domain/credit/credit-terms';
import {
  settleCycle,
  type DueInstallmentInput,
  type SingleChargeInput,
} from '@/core/domain/credit/cycle-settlement';
import { planInstallments } from '@/core/domain/credit/installment-plan';
import { interestForDays } from '@/core/domain/finance/interest';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { datasets } from '../finance/fixtures/datasets';

const pen = (amount: string) => Money.of(amount, 'PEN');
const days = { cutOffDay: 20, paymentDueDay: 26 };
const september = cycleClosingIn(2026, 9, days);

const chargesOf = (ds: (typeof datasets)[number]): SingleChargeInput[] => {
  const terms = CreditTerms.of(ds.terms as CreditTermsInput);
  return ds.singlePaymentCycle.charges.map((c) => ({
    id: c.id,
    principal: pen(c.principal),
    purchaseInstant: new Date(c.purchaseInstant),
    compensatoryRate: terms.compensatory,
  }));
};

const settle = (overrides: Partial<Parameters<typeof settleCycle>[0]> = {}) =>
  settleCycle({
    cycle: september,
    currency: 'PEN',
    singleCharges: chargesOf(datasets[0]!),
    dueInstallments: [],
    voids: [],
    ...overrides,
  });

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('interestForDays', () => {
  it('no cobra interés por 0 días', () => {
    const rate = CreditTerms.of(datasets[0]!.terms as CreditTermsInput).compensatory;
    expect(interestForDays(pen('100.00'), rate, 0).toFixed2()).toBe('0.00');
  });
});

describe('settleCycle (cálculo de US10)', () => {
  it.each(datasets.map((ds) => [ds.title, ds] as const))(
    '%s: intereses por días y total coinciden con el oráculo (crit. 2 y 4)',
    (_title, ds) => {
      const expected = ds.singlePaymentCycle;
      const s = unwrap(settle({ singleCharges: chargesOf(ds) }));
      expect(
        s.lines.map((l) =>
          l.kind === 'PURCHASE' ? [l.chargeId, l.days, l.interest.toFixed2()] : null,
        ),
      ).toEqual(expected.charges.map((c) => [c.id, c.days, c.interest]));
      expect(s.purchasesTotal.toFixed2()).toBe(expected.purchasesTotal);
      expect(s.compensatoryInterestTotal.toFixed2()).toBe(expected.compensatoryInterestTotal);
      expect(s.totalDue.toFixed2()).toBe(expected.totalDue);
    },
  );

  it('ordena las compras por fecha (crit. 4)', () => {
    const s = unwrap(settle({ singleCharges: [...chargesOf(datasets[0]!)].reverse() }));
    expect(s.lines.map((l) => l.kind === 'PURCHASE' && BusinessDate.toISO(l.date))).toEqual([
      '2026-09-03',
      '2026-09-15',
      '2026-09-20',
    ]);
  });

  it('agrupa hasta las 23:59:59 del corte y excluye la compra de las 00:10 del día siguiente (crit. 1 y 5)', () => {
    const late: SingleChargeInput = {
      ...chargesOf(datasets[0]!)[0]!,
      id: 'late',
      purchaseInstant: new Date(datasets[0]!.singlePaymentCycle.excludedPurchaseInstant),
    };
    expect(settle({ singleCharges: [late] })).toEqual({ ok: false, error: 'CHARGE_OUTSIDE_CYCLE' });
  });

  it('rechaza una compra anterior al corte anterior', () => {
    const early: SingleChargeInput = {
      ...chargesOf(datasets[0]!)[0]!,
      purchaseInstant: new Date('2026-08-20T15:00:00Z'),
    };
    expect(settle({ singleCharges: [early] })).toEqual({
      ok: false,
      error: 'CHARGE_OUTSIDE_CYCLE',
    });
  });

  describe('con cuotas francesas (crit. 3 y 7)', () => {
    // Juego 1: la compra en cuotas del 15/09 vence su 1.ª cuota el 26/10 (ciclo de octubre).
    const ds = datasets[0]!;
    const plan = unwrap(
      planInstallments({
        principal: pen(ds.installmentPurchase.principal),
        purchaseInstant: new Date(ds.installmentPurchase.purchaseInstant),
        terms: CreditTerms.of(ds.terms as CreditTermsInput),
        installments: 3,
      }),
    );
    const firstRow = plan.rows[0]!;
    const installment: DueInstallmentInput = {
      id: 'inst-1',
      chargeId: 'charge-installments',
      number: 1,
      totalInstallments: 3,
      dueDate: firstRow.dueDate,
      principal: firstRow.principal,
      interest: firstRow.interest,
    };
    const october = cycleClosingIn(2026, 10, days);

    it('liquida el ciclo aunque no haya compras, solo por la cuota que vence', () => {
      const s = unwrap(
        settle({ cycle: october, singleCharges: [], dueInstallments: [installment] }),
      );
      expect(s.installmentsTotal.toFixed2()).toBe('41.46');
      expect(s.compensatoryInterestTotal.toFixed2()).toBe('0.00');
      expect(s.totalDue.toFixed2()).toBe('41.46');
    });

    it('no cuenta dos veces el interés de la cuota', () => {
      const purchase: SingleChargeInput = {
        id: 'oct-charge',
        principal: pen('10.00'),
        purchaseInstant: new Date('2026-10-20T15:00:00Z'),
        compensatoryRate: CreditTerms.of(ds.terms as CreditTermsInput).compensatory,
      };
      const s = unwrap(
        settle({ cycle: october, singleCharges: [purchase], dueInstallments: [installment] }),
      );
      expect(s.compensatoryInterestTotal.toFixed2()).toBe('0.03'); // solo el de la compra (6 días)
      expect(s.totalDue.toFixed2()).toBe('51.49'); // 10.00 + 0.03 + 41.46
      expect(s.lines.map((l) => l.kind)).toEqual(['PURCHASE', 'INSTALLMENT']);
    });

    it('rechaza una cuota que no vence en la fecha de pago del ciclo', () => {
      expect(settle({ dueInstallments: [installment] })).toEqual({
        ok: false,
        error: 'INSTALLMENT_OUTSIDE_CYCLE',
      });
    });
  });

  describe('anulaciones en el mismo ciclo (crit. 4, decisión P2)', () => {
    it('descuentan la compra anulada completa: capital más su interés', () => {
      const s = unwrap(settle({ voids: [{ chargeId: 'charge-3' }] }));
      const purchase = s.lines.find((l) => l.kind === 'PURCHASE' && l.chargeId === 'charge-3')!;
      const voided = s.lines.at(-1)!;
      expect(voided.kind).toBe('VOID');
      expect(voided.amount.equals(purchase.amount)).toBe(true);
      expect(s.adjustmentsTotal.equals(purchase.amount)).toBe(true);
      expect(s.totalDue.equals(Money.of('76.05', 'PEN').minus(purchase.amount))).toBe(true);
    });

    it('anular todas las compras deja el ciclo en cero, nunca en negativo', () => {
      const s = unwrap(
        settle({
          voids: [{ chargeId: 'charge-1' }, { chargeId: 'charge-2' }, { chargeId: 'charge-3' }],
        }),
      );
      expect(s.totalDue.isZero()).toBe(true);
    });

    it('rechaza anular un cargo que no es de este ciclo', () => {
      expect(settle({ voids: [{ chargeId: 'otro' }] })).toEqual({
        ok: false,
        error: 'VOID_OUTSIDE_CYCLE',
      });
    });
  });

  it('no mezcla monedas', () => {
    expect(
      settle({
        dueInstallments: [
          {
            id: 'i',
            chargeId: 'x',
            number: 1,
            totalInstallments: 1,
            dueDate: september.paymentDueDate,
            principal: Money.of('1', 'USD'),
            interest: Money.of('0', 'USD'),
          },
        ],
      }),
    ).toEqual({ ok: false, error: 'CURRENCY_MISMATCH' });
  });
});
