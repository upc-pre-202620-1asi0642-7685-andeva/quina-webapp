import Decimal from 'decimal.js';

/**
 * Único punto del dominio que conoce `decimal.js` (regla de ESLint). Precisión
 * de 34 dígitos significativos y redondeo comercial (mitad hacia arriba).
 */
export const Dec = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;
