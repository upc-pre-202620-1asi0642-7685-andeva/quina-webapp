import { BusinessDate } from '@/core/domain/shared/business-date';

const adjustedDay = (date: BusinessDate): number =>
  date.day === 31 || BusinessDate.isLastDayOfFebruary(date) ? 30 : date.day;

/**
 * Días entre dos fechas en base comercial 30/360: todos los meses tienen 30
 * días, el día 31 cuenta como 30 y febrero se completa hasta 30 (su último día
 * cuenta como 30). Negativo si `to` es anterior a `from`.
 */
export function days30360(from: BusinessDate, to: BusinessDate): number {
  return (
    360 * (to.year - from.year) + 30 * (to.month - from.month) + adjustedDay(to) - adjustedDay(from)
  );
}
