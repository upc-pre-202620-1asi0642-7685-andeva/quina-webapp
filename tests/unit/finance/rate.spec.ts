import { describe, expect, it } from 'vitest';
import { Rate, type RateInput } from '@/core/domain/finance/rate';
import { Dec } from '@/core/domain/shared/decimal';
import { datasets } from './fixtures/datasets';

const effective = (value: string, period: RateInput['period'] = 'ANNUAL'): RateInput => ({
  type: 'EFFECTIVE',
  value,
  period,
  capitalization: null,
});

const fixed20 = (x: Dec) => x.toFixed(20);

describe('Rate', () => {
  const kinds = ['compensatory', 'moratory'] as const;
  const cases = datasets.flatMap((ds) => kinds.map((kind) => [ds.id, kind, ds] as const));

  it.each(cases)('%s %s coincide con el oráculo (TEA, diaria y mensual)', (_id, kind, ds) => {
    const rate = Rate.of(ds.terms[kind] as RateInput);
    const expected = ds.rates[kind];
    expect(fixed20(rate.tea())).toBe(expected.tea);
    expect(fixed20(rate.daily())).toBe(expected.daily);
    expect(fixed20(rate.monthly())).toBe(expected.monthly);
  });

  it('TNA 24 % capitalizable mensualmente da TEM 2 %', () => {
    const rate = Rate.of({
      type: 'NOMINAL',
      value: '0.24',
      period: 'ANNUAL',
      capitalization: 'MONTHLY',
    });
    expect(fixed20(rate.monthly())).toBe('0.02000000000000000000');
  });

  it('TNA 15 % capitalizable diariamente da i_d = 0.15 / 360', () => {
    const rate = Rate.of({
      type: 'NOMINAL',
      value: '0.15',
      period: 'ANNUAL',
      capitalization: 'DAILY',
    });
    expect(fixed20(rate.daily())).toBe(fixed20(new Dec('0.15').dividedBy(360)));
  });

  it('TEM 2 % efectiva da TEA = 1.02^12 − 1', () => {
    const rate = Rate.of(effective('0.02', 'MONTHLY'));
    expect(fixed20(rate.tea())).toBe(fixed20(new Dec('1.02').pow(12).minus(1)));
  });

  it('una tasa nominal mensual capitalizable diariamente usa m = 30', () => {
    const rate = Rate.of({
      type: 'NOMINAL',
      value: '0.03',
      period: 'MONTHLY',
      capitalization: 'DAILY',
    });
    expect(fixed20(rate.daily())).toBe(fixed20(new Dec('0.03').dividedBy(30)));
  });

  it('una nominal cuya capitalización iguala al periodo equivale a la efectiva', () => {
    const nominal = Rate.of({
      type: 'NOMINAL',
      value: '0.2',
      period: 'ANNUAL',
      capitalization: 'ANNUAL',
    });
    expect(fixed20(nominal.tea())).toBe('0.20000000000000000000');
  });

  it('la tasa 0 da factores neutros (clientes de confianza, US06 crit. 5)', () => {
    const rate = Rate.of(effective('0.0000'));
    expect(rate.isZero()).toBe(true);
    expect(rate.compoundFactor(34).toString()).toBe('1');
    expect(rate.monthly().isZero()).toBe(true);
  });

  it('el factor por 0 días o menos es 1', () => {
    expect(Rate.of(effective('0.2')).compoundFactor(0).toString()).toBe('1');
    expect(Rate.of(effective('0.2')).compoundFactor(-3).toString()).toBe('1');
  });

  it.each([
    [effective('-0.1'), 'NEGATIVE_RATE'],
    [effective('20%'), 'RATE_VALUE_INVALID'],
    [{ ...effective('0.2'), capitalization: 'MONTHLY' }, 'EFFECTIVE_HAS_CAPITALIZATION'],
    [{ ...effective('0.2'), type: 'NOMINAL' }, 'NOMINAL_NEEDS_CAPITALIZATION'],
    [
      { type: 'NOMINAL', value: '0.02', period: 'MONTHLY', capitalization: 'ANNUAL' },
      'CAPITALIZATION_LONGER_THAN_PERIOD',
    ],
  ] as const)('rechaza %j con %s', (input, error) => {
    expect(Rate.parse(input as RateInput)).toEqual({ ok: false, error });
    expect(() => Rate.of(input as RateInput)).toThrow(RangeError);
  });
});
