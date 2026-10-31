import { Dec } from '@/core/domain/shared/decimal';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Hasta 99 999.99 %: la fracción debe caber en `NUMERIC(7, 4)`. */
const PERCENT = /^\d{1,5}(\.\d{1,2})?$/;

/** El dueño escribe porcentajes (3.50 %); la base guarda fracciones (0.0350). */
export const RatePercent = {
  toFraction(raw: string): Result<string, 'RATE_PERCENT_INVALID'> {
    const clean = raw.trim().replace(',', '.');
    if (!PERCENT.test(clean)) return err('RATE_PERCENT_INVALID');
    return ok(new Dec(clean).dividedBy(100).toFixed(4));
  },

  fromFraction(fraction: string): string {
    return new Dec(fraction).times(100).toFixed(2);
  },
};
