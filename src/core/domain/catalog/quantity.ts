import { Dec } from '@/core/domain/shared/decimal';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type QuantityError = 'QUANTITY_INVALID' | 'QUANTITY_NOT_WHOLE' | 'QUANTITY_NOT_POSITIVE';

/** Hasta 7 enteros y 3 decimales: lo que cabe en `NUMERIC(10, 3)`. */
const QUANTITY = /^\d{1,7}(\.\d{1,3})?$/;

export const Quantity = {
  /**
   * Cantidad de stock o de venta como texto con 3 decimales. Entera si la unidad
   * no admite decimales; hasta 3 decimales a granel (US16 crit. 5).
   */
  parse(
    raw: string,
    options: { allowDecimals: boolean; allowZero?: boolean },
  ): Result<string, QuantityError> {
    const clean = raw.trim().replace(',', '.');
    if (!QUANTITY.test(clean)) return err('QUANTITY_INVALID');
    const value = new Dec(clean);
    if (!options.allowDecimals && !value.isInteger()) return err('QUANTITY_NOT_WHOLE');
    if (!options.allowZero && value.isZero()) return err('QUANTITY_NOT_POSITIVE');
    return ok(value.toFixed(3));
  },

  isZero(quantity: string): boolean {
    return new Dec(quantity).isZero();
  },

  plus(a: string, b: string): string {
    return new Dec(a).plus(b).toFixed(3);
  },

  /** `a − b` con 3 decimales (puede salir negativo: la diferencia de un conteo). */
  minus(a: string, b: string): string {
    return new Dec(a).minus(b).toFixed(3);
  },

  /** Valorización de un movimiento del kardex: cantidad × costo unitario, a céntimos. */
  valuedAt(quantity: string, unitCost: string): string {
    return new Dec(quantity).times(unitCost).toFixed(2);
  },

  compare(a: string, b: string): -1 | 0 | 1 {
    return new Dec(a).comparedTo(b) as -1 | 0 | 1;
  },
};
