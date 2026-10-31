import { describe, expect, it } from 'vitest';
import { cycleClosingIn, cycleContains, cycleFor } from '@/core/domain/credit/billing-cycle';
import { CreditTerms, type CreditTermsInput } from '@/core/domain/credit/credit-terms';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { datasets } from '../finance/fixtures/datasets';

const iso = BusinessDate.toISO;
const days = { cutOffDay: 20, paymentDueDay: 26 };

describe('cycleFor', () => {
  it('una compra antes del corte cierra ese mes y se paga el 26', () => {
    const cycle = cycleFor(new Date('2026-09-15T15:00:00Z'), days);
    expect(iso(cycle.cutOffDate)).toBe('2026-09-20');
    expect(iso(cycle.paymentDueDate)).toBe('2026-09-26');
    expect(iso(cycle.previousCutOffDate)).toBe('2026-08-20');
    expect([cycle.periodYear, cycle.periodMonth]).toEqual([2026, 9]);
  });

  it('el corte incluye hasta las 23:59:59 de Lima del día de corte', () => {
    expect(iso(cycleFor(new Date('2026-09-21T04:59:59.999Z'), days).cutOffDate)).toBe('2026-09-20');
    expect(iso(cycleFor(new Date('2026-09-21T05:00:00.000Z'), days).cutOffDate)).toBe('2026-10-20');
  });

  it('una compra después del corte pasa al ciclo siguiente', () => {
    const cycle = cycleFor(new Date('2026-09-22T15:00:00Z'), days);
    expect(iso(cycle.cutOffDate)).toBe('2026-10-20');
    expect(iso(cycle.paymentDueDate)).toBe('2026-10-26');
  });

  it('con pago anterior al corte, el pago vence el mes siguiente', () => {
    const cycle = cycleFor(new Date('2026-09-10T15:00:00Z'), { cutOffDay: 25, paymentDueDay: 5 });
    expect(iso(cycle.cutOffDate)).toBe('2026-09-25');
    expect(iso(cycle.paymentDueDate)).toBe('2026-10-05');
  });

  it('con pago igual al corte, el pago vence el mes siguiente', () => {
    const cycle = cycleFor(new Date('2026-09-10T15:00:00Z'), { cutOffDay: 15, paymentDueDay: 15 });
    expect(iso(cycle.paymentDueDate)).toBe('2026-10-15');
  });

  it('diciembre después del corte pasa a enero del año siguiente', () => {
    const cycle = cycleFor(new Date('2026-12-28T15:00:00Z'), days);
    expect(iso(cycle.cutOffDate)).toBe('2027-01-20');
    expect([cycle.periodYear, cycle.periodMonth]).toEqual([2027, 1]);
  });

  it('expone el corte y el pago como instantes de fin de día en Lima', () => {
    const cycle = cycleClosingIn(2026, 9, days);
    expect(cycle.cutOffInstant.toISOString()).toBe('2026-09-21T04:59:59.999Z');
    expect(cycle.paymentDueInstant.toISOString()).toBe('2026-09-27T04:59:59.999Z');
  });

  it('el juego de datos excluye la compra de las 00:10 del 21/09', () => {
    const cycle = datasets[0]!.singlePaymentCycle;
    expect(iso(cycleFor(new Date(cycle.excludedPurchaseInstant), days).cutOffDate)).toBe(
      cycle.excludedCycleCutOffDate,
    );
  });
});

describe('cycleContains', () => {
  const cycle = cycleClosingIn(2026, 9, days);
  it.each([
    ['2026-08-21T04:59:59.999Z', false], // 20/08 23:59 en Lima: ciclo anterior
    ['2026-08-21T05:00:00.000Z', true], // 21/08 00:00 en Lima: primer instante del ciclo
    ['2026-09-21T04:59:59.999Z', true], // 20/09 23:59:59.999 en Lima: último instante
    ['2026-09-21T05:00:00.000Z', false], // 21/09 00:00 en Lima: ciclo siguiente
  ])('%s → %s', (instant, expected) => {
    expect(cycleContains(cycle, new Date(instant))).toBe(expected);
  });
});

describe('CreditTerms', () => {
  const base: CreditTermsInput = datasets[0]!.terms as CreditTermsInput;

  it('acepta las condiciones de los juegos de datos', () => {
    for (const ds of datasets) {
      expect(CreditTerms.create(ds.terms as CreditTermsInput).ok).toBe(true);
    }
  });

  it.each([
    [{ cutOffDay: 0 }, 'CUT_OFF_DAY_OUT_OF_RANGE'],
    [{ cutOffDay: 29 }, 'CUT_OFF_DAY_OUT_OF_RANGE'],
    [{ paymentDueDay: 31 }, 'PAYMENT_DUE_DAY_OUT_OF_RANGE'],
    [{ paymentDueDay: 1.5 }, 'PAYMENT_DUE_DAY_OUT_OF_RANGE'],
    [{ maxInstallmentMonths: 25 }, 'MAX_INSTALLMENT_MONTHS_OUT_OF_RANGE'],
    [{ maxInstallmentMonths: 0 }, 'MAX_INSTALLMENT_MONTHS_OUT_OF_RANGE'],
    [{ compensatory: { ...base.compensatory, value: '-0.1' } }, 'COMPENSATORY_NEGATIVE_RATE'],
    [
      { moratory: { ...base.moratory, type: 'NOMINAL' as const } },
      'MORATORY_NOMINAL_NEEDS_CAPITALIZATION',
    ],
  ])('rechaza %j con %s', (patch, error) => {
    expect(CreditTerms.create({ ...base, ...patch })).toEqual({ ok: false, error });
  });
});
