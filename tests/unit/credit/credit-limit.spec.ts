import { describe, expect, it } from 'vitest';
import { CreditLimit } from '@/core/domain/credit/credit-limit';

describe('CreditLimit.parse', () => {
  it('acepta un monto positivo y lo deja en céntimos', () => {
    const result = CreditLimit.parse('150', 'PEN');
    expect(result.ok && result.value.toFixed2()).toBe('150.00');
    expect(result.ok && result.value.currency).toBe('PEN');
  });

  it('ignora espacios y separadores de miles', () => {
    const result = CreditLimit.parse(' 1,234.50 ', 'USD');
    expect(result.ok && result.value.toString()).toBe('USD 1234.50');
  });

  it('rechaza cero y negativos (US06 crit. 3)', () => {
    expect(CreditLimit.parse('0', 'PEN')).toEqual({
      ok: false,
      error: 'CREDIT_LIMIT_NOT_POSITIVE',
    });
    expect(CreditLimit.parse('-5', 'PEN')).toEqual({ ok: false, error: 'CREDIT_LIMIT_INVALID' });
  });

  it('rechaza texto, más de 2 decimales y montos que no caben en NUMERIC(12, 2)', () => {
    expect(CreditLimit.parse('cien', 'PEN')).toEqual({ ok: false, error: 'CREDIT_LIMIT_INVALID' });
    expect(CreditLimit.parse('10.005', 'PEN')).toEqual({
      ok: false,
      error: 'CREDIT_LIMIT_INVALID',
    });
    expect(CreditLimit.parse('10000000000', 'PEN')).toEqual({
      ok: false,
      error: 'CREDIT_LIMIT_INVALID',
    });
  });
});
