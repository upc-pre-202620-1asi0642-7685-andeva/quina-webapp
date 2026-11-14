import { BusinessDate } from '../shared/business-date';
import { Dec } from '../shared/decimal';
import type { Money } from '../shared/money';

export const TAX_REGIMES = ['NUEVO_RUS', 'RER', 'MYPE', 'GENERAL'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

export const RUS_CATEGORIES = [1, 2] as const;
export type RusCategory = (typeof RUS_CATEGORIES)[number];

export type TaxSettings = { taxRegime: TaxRegime; rusCategory: RusCategory };

/** US21 crit. 4: la alerta preventiva se enciende al 85 % del tope. */
const WARNING_RATIO = new Dec('0.85');

export type RusLevel = 'ok' | 'warning' | 'over';

export type RusProgress = {
  level: RusLevel;
  /** Porcentaje entero para la barra (puede pasar de 100). */
  percent: number;
};

/** Cuánto del tope mensual de una categoría ya se usó (ventas o compras). */
export function rusProgress(used: Money, cap: Money): RusProgress {
  const ratio = used.decimal().dividedBy(cap.decimal());
  const level: RusLevel = ratio.greaterThan(1)
    ? 'over'
    : ratio.greaterThanOrEqualTo(WARNING_RATIO)
      ? 'warning'
      : 'ok';
  return { level, percent: ratio.times(100).toDecimalPlaces(0, Dec.ROUND_DOWN).toNumber() };
}

/**
 * US21 crit. 6: el mes de Lima en curso, del día 1 al último. El cálculo
 * "reinicia" a las 00:00 del día 1 porque el rango cambia solo.
 */
export function rusMonth(now: Date): { from: BusinessDate; to: BusinessDate } {
  const today = BusinessDate.fromInstant(now);
  const from = BusinessDate.of(today.year, today.month, 1);
  const to = BusinessDate.addDays(BusinessDate.addCalendarMonths(from, 1), -1);
  return { from, to };
}
