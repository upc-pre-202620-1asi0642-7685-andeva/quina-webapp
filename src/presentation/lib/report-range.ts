import { BusinessDate } from '@/core/domain/shared/business-date';

const MAX_DAYS = 366;

export type ReportRange = { from: BusinessDate; to: BusinessDate };

/**
 * US20: rango de días de Lima que elige el dueño. Por defecto, del día 1 del mes
 * a hoy; un rango al revés, de más de un año o con fechas inválidas no vale.
 */
export function parseReportRange(
  rawFrom: string | undefined,
  rawTo: string | undefined,
  now: Date,
): ReportRange | null {
  const today = BusinessDate.fromInstant(now);
  try {
    const from = rawFrom
      ? BusinessDate.parse(rawFrom)
      : BusinessDate.of(today.year, today.month, 1);
    const to = rawTo ? BusinessDate.parse(rawTo) : today;
    const days = BusinessDate.daysBetween(from, to);
    return days < 0 || days > MAX_DAYS ? null : { from, to };
  } catch {
    return null;
  }
}
