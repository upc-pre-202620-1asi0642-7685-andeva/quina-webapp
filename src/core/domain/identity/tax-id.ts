import { err, ok, type Result } from '@/core/domain/shared/result';

export type TaxId = { type: 'RUC' | 'DNI'; number: string };

export const TaxId = {
  /** Quita espacios y guiones; 11 dígitos es RUC y 8 es DNI. */
  parse(raw: string): Result<TaxId, 'TAX_ID_INVALID'> {
    const digits = raw.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(digits)) return err('TAX_ID_INVALID');
    if (digits.length === 11) return ok({ type: 'RUC', number: digits });
    if (digits.length === 8) return ok({ type: 'DNI', number: digits });
    return err('TAX_ID_INVALID');
  },
};
