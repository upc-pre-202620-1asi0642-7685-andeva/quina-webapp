import { describe, expect, it } from 'vitest';
import { TaxId } from '@/core/domain/identity/tax-id';

describe('TaxId.parse', () => {
  it('normaliza un RUC con espacios', () => {
    expect(TaxId.parse('20 123456789')).toEqual({
      ok: true,
      value: { type: 'RUC', number: '20123456789' },
    });
  });

  it('normaliza un DNI con guiones', () => {
    expect(TaxId.parse('4567-8901')).toEqual({
      ok: true,
      value: { type: 'DNI', number: '45678901' },
    });
  });

  it('rechaza longitudes distintas de 8 u 11', () => {
    expect(TaxId.parse('123')).toEqual({ ok: false, error: 'TAX_ID_INVALID' });
  });

  it('rechaza caracteres que no son dígitos', () => {
    expect(TaxId.parse('abcdefghijk')).toEqual({ ok: false, error: 'TAX_ID_INVALID' });
  });
});
