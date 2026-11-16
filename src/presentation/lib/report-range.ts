import { BusinessDate } from '@/core/domain/shared/business-date';

const MAX_DAYS = 366;

export type ReportRange = { from: BusinessDate; to: BusinessDate };

export type ReportPreset = 'today' | '7d' | 'thisMonth' | 'lastMonth' | 'custom';

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

/** Resuelve las fechas de Lima para uno de los accesos rápidos del reporte. */
export function resolveReportPreset(
  preset: Exclude<ReportPreset, 'custom'>,
  now: Date,
): ReportRange {
  const today = BusinessDate.fromInstant(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: BusinessDate.addDays(today, -6), to: today };
    case 'thisMonth':
      return { from: BusinessDate.of(today.year, today.month, 1), to: today };
    case 'lastMonth': {
      const firstOfThisMonth = BusinessDate.of(today.year, today.month, 1);
      const from = BusinessDate.addCalendarMonths(firstOfThisMonth, -1);
      const to = BusinessDate.addDays(firstOfThisMonth, -1);
      return { from, to };
    }
  }
}

const sameRange = (a: ReportRange, b: ReportRange) =>
  BusinessDate.compare(a.from, b.from) === 0 && BusinessDate.compare(a.to, b.to) === 0;

/** Detecta si un rango coincide con un acceso rápido conocido o es personalizado. */
export function detectReportPreset(range: ReportRange, now: Date): ReportPreset {
  const candidates: Exclude<ReportPreset, 'custom'>[] = ['thisMonth', 'today', '7d', 'lastMonth'];
  // Si el día 1 o el día 7 coinciden dos rangos, prioriza el preset por defecto ('thisMonth')
  for (const preset of candidates) {
    if (sameRange(range, resolveReportPreset(preset, now))) {
      return preset;
    }
  }
  return 'custom';
}

/** Rango inmediato anterior con la misma cantidad de días calendario. */
export function previousReportRange(range: ReportRange): ReportRange {
  const spanDays = BusinessDate.daysBetween(range.from, range.to) + 1;
  const to = BusinessDate.addDays(range.from, -1);
  const from = BusinessDate.addDays(to, -(spanDays - 1));
  return { from, to };
}
