import { describe, expect, it } from 'vitest';
import { CreditTerms, type CreditTermsInput } from '@/core/domain/credit/credit-terms';
import { planInstallments } from '@/core/domain/credit/installment-plan';
import { FrenchAmortizationCalculator } from '@/core/domain/finance/french-schedule';
import { Rate } from '@/core/domain/finance/rate';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { control, datasets } from './fixtures/datasets';

const pen = (amount: string) => Money.of(amount, 'PEN');

type Expected = (typeof datasets)[number]['installmentPurchase'];

const plan = (terms: CreditTermsInput, expected: Expected) => {
  const result = planInstallments({
    principal: pen(expected.principal),
    purchaseInstant: new Date(expected.purchaseInstant),
    terms: CreditTerms.of(terms),
    installments: expected.installments,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const asText = (p: ReturnType<typeof plan>) => ({
  cycleCutOffDate: BusinessDate.toISO(p.cycle.cutOffDate),
  cyclePaymentDueDate: BusinessDate.toISO(p.cycle.paymentDueDate),
  graceDays: p.graceDays,
  capitalizedAmount: p.capitalizedAmount.toFixed2(),
  installmentAmount: p.installmentAmount.toFixed2(),
  rows: p.rows.map((r) => ({
    number: r.number,
    dueDate: BusinessDate.toISO(r.dueDate),
    initialBalance: r.initialBalance.toFixed2(),
    installment: r.installment.toFixed2(),
    interest: r.interest.toFixed2(),
    principal: r.principal.toFixed2(),
    finalBalance: r.finalBalance.toFixed2(),
  })),
});

describe('Cronograma francés con gracia capitalizada (US09)', () => {
  const cases = [
    ...datasets.map((ds) => [ds.title, ds.terms, ds.installmentPurchase] as const),
    [
      'Control: TEA 20 % con 34 días de gracia',
      control.terms,
      control.installmentPurchase,
    ] as const,
  ];

  it.each(cases)('%s coincide fila por fila con el oráculo', (_title, terms, expected) => {
    expect(asText(plan(terms as CreditTermsInput, expected))).toEqual({
      cycleCutOffDate: expected.cycleCutOffDate,
      cyclePaymentDueDate: expected.cyclePaymentDueDate,
      graceDays: expected.graceDays,
      capitalizedAmount: expected.capitalizedAmount,
      installmentAmount: expected.installmentAmount,
      rows: expected.rows,
    });
  });

  it('crit. 1 y 7: 11 días de gracia antes del corte y cuotas desde octubre', () => {
    const p = plan(datasets[0]!.terms as CreditTermsInput, datasets[0]!.installmentPurchase);
    expect(p.graceDays).toBe(11);
    expect(p.rows.map((r) => BusinessDate.toISO(r.dueDate))).toEqual([
      '2026-10-26',
      '2026-11-26',
      '2026-12-26',
    ]);
  });

  it('crit. 1 y 7: 34 días de gracia después del corte y cuotas desde noviembre', () => {
    const p = plan(datasets[1]!.terms as CreditTermsInput, datasets[1]!.installmentPurchase);
    expect(p.graceDays).toBe(34);
    expect(BusinessDate.toISO(p.rows[0]!.dueDate)).toBe('2026-11-26');
  });

  it('crit. 5: la suma de amortizaciones es exactamente el capital capitalizado', () => {
    for (const ds of datasets) {
      const p = plan(ds.terms as CreditTermsInput, ds.installmentPurchase);
      expect(
        Money.sum(
          p.rows.map((r) => r.principal),
          'PEN',
        ).equals(p.capitalizedAmount),
      ).toBe(true);
    }
  });

  it('con tasa 0 no hay intereses y la cuota es S / n', () => {
    const s = FrenchAmortizationCalculator.schedule({
      principal: pen('100.00'),
      rate: Rate.of({ type: 'EFFECTIVE', value: '0', period: 'ANNUAL', capitalization: null }),
      graceDays: 20,
      installments: 3,
      cycleDueDate: BusinessDate.parse('2026-09-26'),
    });
    expect(s.capitalizedAmount.toFixed2()).toBe('100.00');
    expect(s.rows.map((r) => r.installment.toFixed2())).toEqual(['33.33', '33.33', '33.34']);
    expect(s.rows.every((r) => r.interest.isZero())).toBe(true);
  });

  it('con una sola cuota paga capital capitalizado más un mes de interés', () => {
    const s = FrenchAmortizationCalculator.schedule({
      principal: pen('120.00'),
      rate: Rate.of({
        type: 'NOMINAL',
        value: '0.24',
        period: 'ANNUAL',
        capitalization: 'MONTHLY',
      }),
      graceDays: 0,
      installments: 1,
      cycleDueDate: BusinessDate.parse('2026-09-26'),
    });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]!.installment.toFixed2()).toBe('122.40');
  });

  describe('validaciones', () => {
    const terms = CreditTerms.of(datasets[0]!.terms as CreditTermsInput); // máximo 6 meses
    const input = {
      principal: pen('120.00'),
      purchaseInstant: new Date('2026-09-15T15:00:00Z'),
      terms,
    };

    it.each([
      [0, 'INSTALLMENTS_OUT_OF_RANGE'],
      [25, 'INSTALLMENTS_OUT_OF_RANGE'],
      [2.5, 'INSTALLMENTS_OUT_OF_RANGE'],
      [7, 'EXCEEDS_MAX_INSTALLMENT_MONTHS'],
    ])('%s cuotas → %s', (installments, error) => {
      expect(planInstallments({ ...input, installments })).toEqual({ ok: false, error });
    });

    it('rechaza un capital no positivo o en otra moneda', () => {
      expect(planInstallments({ ...input, installments: 3, principal: pen('0') })).toEqual({
        ok: false,
        error: 'PRINCIPAL_NOT_POSITIVE',
      });
      expect(
        planInstallments({ ...input, installments: 3, principal: Money.of('10', 'USD') }),
      ).toEqual({ ok: false, error: 'CURRENCY_MISMATCH' });
    });
  });

  describe('propiedades con 200 combinaciones generadas', () => {
    // Generador congruencial con semilla fija: reproducible sin dependencias.
    let seed = 20261031;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % max;
    };

    const combos = Array.from({ length: 200 }, () => ({
      principal: pen(`${1 + next(5000)}.${String(next(100)).padStart(2, '0')}`),
      rate: Rate.of({
        type: 'EFFECTIVE',
        value: `0.${String(next(10000)).padStart(4, '0')}`,
        period: 'ANNUAL',
        capitalization: null,
      }),
      graceDays: next(60),
      installments: 1 + next(24),
    }));

    it('cierra en 0.00, sin saldos negativos, Σ amortización = S_cap y última cuota ≈ R', () => {
      for (const c of combos) {
        const s = FrenchAmortizationCalculator.schedule({
          ...c,
          cycleDueDate: BusinessDate.parse('2026-09-26'),
        });
        const last = s.rows.at(-1)!;
        expect(last.finalBalance.isZero()).toBe(true);
        expect(s.rows.every((r) => !r.finalBalance.isNegative())).toBe(true);
        expect(
          Money.sum(
            s.rows.map((r) => r.principal),
            'PEN',
          ).equals(s.capitalizedAmount),
        ).toBe(true);
        const drift = last.installment.minus(s.installmentAmount).decimal().abs();
        expect(drift.lessThanOrEqualTo(0.01 * c.installments)).toBe(true);
      }
    });
  });
});
