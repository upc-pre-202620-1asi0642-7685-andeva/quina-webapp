import { describe, expect, it } from 'vitest';
import { CreditTerms, type CreditTermsInput } from '@/core/domain/credit/credit-terms';
import { RateCaps, type RateCap } from '@/core/domain/credit/rate-cap';
import { BusinessDate } from '@/core/domain/shared/business-date';

const CAPS: RateCap[] = [
  cap('COMPENSATORY', 'PEN', '1.1413', '2026-05-01'),
  cap('MORATORY', 'PEN', '0.1711', '2026-05-01'),
  cap('COMPENSATORY', 'USD', '0.9984', '2026-05-01'),
  cap('MORATORY', 'USD', '0.1497', '2026-05-01'),
];

function cap(
  kind: RateCap['kind'],
  currency: RateCap['currency'],
  max: string,
  validFrom: string,
  validTo: string | null = null,
): RateCap {
  return {
    kind,
    currency,
    maxEffectiveAnnualRate: max,
    validFrom: BusinessDate.parse(validFrom),
    validTo: validTo ? BusinessDate.parse(validTo) : null,
  };
}

function terms(overrides: Partial<CreditTermsInput> = {}) {
  return CreditTerms.of({
    currency: 'PEN',
    compensatory: { type: 'EFFECTIVE', value: '0.2000', period: 'ANNUAL', capitalization: null },
    moratory: { type: 'EFFECTIVE', value: '0.1500', period: 'ANNUAL', capitalization: null },
    cutOffDay: 20,
    paymentDueDay: 26,
    maxInstallmentMonths: 3,
    ...overrides,
  });
}

const ON = BusinessDate.parse('2026-11-15');

describe('RateCaps.check (US06 crit. 2)', () => {
  it('acepta tasas por debajo del tope vigente', () => {
    expect(RateCaps.check(terms(), CAPS, ON)).toEqual({ ok: true, value: undefined });
  });

  it('acepta una TEA exactamente igual al tope', () => {
    const atCap = terms({
      compensatory: { type: 'EFFECTIVE', value: '1.1413', period: 'ANNUAL', capitalization: null },
    });
    expect(RateCaps.check(atCap, CAPS, ON).ok).toBe(true);
  });

  it('acepta la tasa compensatoria de 0 % (US06 crit. 5)', () => {
    const zero = terms({
      compensatory: { type: 'EFFECTIVE', value: '0', period: 'MONTHLY', capitalization: null },
    });
    expect(RateCaps.check(zero, CAPS, ON).ok).toBe(true);
  });

  it('compara la TEA equivalente: 7 % mensual efectivo (TEA 125 %) pasa el tope en soles', () => {
    const monthly = terms({
      compensatory: { type: 'EFFECTIVE', value: '0.0700', period: 'MONTHLY', capitalization: null },
    });
    expect(RateCaps.check(monthly, CAPS, ON)).toEqual({
      ok: false,
      error: 'COMPENSATORY_RATE_ABOVE_CAP',
    });
  });

  it('compara la TEA de una tasa nominal: TNA 16 % capitalizable diariamente pasa la moratoria', () => {
    const nominal = terms({
      moratory: { type: 'NOMINAL', value: '0.1600', period: 'ANNUAL', capitalization: 'DAILY' },
    });
    expect(RateCaps.check(nominal, CAPS, ON)).toEqual({
      ok: false,
      error: 'MORATORY_RATE_ABOVE_CAP',
    });
  });

  it('usa el tope de la moneda de la cuenta', () => {
    const usd = terms({
      currency: 'USD',
      compensatory: { type: 'EFFECTIVE', value: '1.0000', period: 'ANNUAL', capitalization: null },
    });
    expect(RateCaps.check(usd, CAPS, ON)).toEqual({
      ok: false,
      error: 'COMPENSATORY_RATE_ABOVE_CAP',
    });
    expect(RateCaps.check({ ...usd, currency: 'PEN' }, CAPS, ON).ok).toBe(true);
  });

  it('elige la vigencia más reciente que ya empezó', () => {
    const caps = [
      ...CAPS,
      cap('COMPENSATORY', 'PEN', '0.1500', '2026-11-01'),
      cap('COMPENSATORY', 'PEN', '0.0100', '2027-05-01'),
    ];
    expect(RateCaps.check(terms(), caps, ON)).toEqual({
      ok: false,
      error: 'COMPENSATORY_RATE_ABOVE_CAP',
    });
    expect(RateCaps.check(terms(), caps, BusinessDate.parse('2026-10-31')).ok).toBe(true);
  });

  it('rechaza si no hay tope vigente para la moneda y el tipo de tasa (falla cerrado)', () => {
    const onlyCompensatory = CAPS.filter((c) => c.kind === 'COMPENSATORY');
    expect(RateCaps.check(terms(), onlyCompensatory, ON)).toEqual({
      ok: false,
      error: 'MORATORY_NO_CAP_IN_FORCE',
    });
    const expired = [cap('COMPENSATORY', 'PEN', '1.1413', '2026-05-01', '2026-10-31')];
    expect(RateCaps.check(terms(), expired, ON)).toEqual({
      ok: false,
      error: 'COMPENSATORY_NO_CAP_IN_FORCE',
    });
  });

  it('inForce devuelve el tope para mostrarlo en el mensaje', () => {
    expect(RateCaps.inForce(CAPS, 'MORATORY', 'USD', ON)?.maxEffectiveAnnualRate).toBe('0.1497');
  });
});
