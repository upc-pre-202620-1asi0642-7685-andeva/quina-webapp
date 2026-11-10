/**
 * Día calendario del negocio en `America/Lima`. Perú usa UTC−5 fijo y sin
 * horario de verano, así que basta desplazar 5 horas: no se depende de ICU.
 */
export type BusinessDate = { readonly year: number; readonly month: number; readonly day: number };

const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const END_OF_DAY_MS = 24 * 60 * 60 * 1000 - 1;

const make = (year: number, month: number, day: number): BusinessDate => {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Fecha inválida: ${year}-${month}-${day}`);
  }
  return Object.freeze({ year, month, day });
};

export const BusinessDate = {
  of: make,

  /** `YYYY-MM-DD`. */
  parse(iso: string): BusinessDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) throw new RangeError(`Fecha inválida: "${iso}"`);
    return make(Number(match[1]), Number(match[2]), Number(match[3]));
  },

  /** Día de Lima al que pertenece un instante UTC. */
  fromInstant(instant: Date): BusinessDate {
    const lima = new Date(instant.getTime() - LIMA_OFFSET_MS);
    return make(lima.getUTCFullYear(), lima.getUTCMonth() + 1, lima.getUTCDate());
  },

  /** Primer instante (00:00:00.000 de Lima) del día. */
  startInstant(date: BusinessDate): Date {
    return new Date(Date.UTC(date.year, date.month - 1, date.day) + LIMA_OFFSET_MS);
  },

  /** Último instante (23:59:59.999 de Lima) del día: así se guardan corte y pago. */
  endInstant(date: BusinessDate): Date {
    return new Date(BusinessDate.startInstant(date).getTime() + END_OF_DAY_MS);
  },

  /** Suma meses conservando el día; solo para días 1 a 28, que existen en todo mes. */
  addMonths(date: BusinessDate, months: number): BusinessDate {
    if (date.day > 28) throw new RangeError('addMonths solo admite días del 1 al 28');
    const index = date.year * 12 + (date.month - 1) + months;
    return make(Math.floor(index / 12), (index % 12) + 1, date.day);
  },

  /** Suma meses calendario ajustando al último día del mes destino si el día es 29, 30 o 31. */
  addCalendarMonths(date: BusinessDate, months: number): BusinessDate {
    if (!Number.isInteger(months)) throw new RangeError('months debe ser entero');
    const index = date.year * 12 + (date.month - 1) + months;
    const targetYear = Math.floor(index / 12);
    const targetMonth = (((index % 12) + 12) % 12) + 1;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    return make(targetYear, targetMonth, Math.min(date.day, lastDay));
  },

  /** Suma `days` días calendario (positivos o negativos). */
  addDays(date: BusinessDate, days: number): BusinessDate {
    if (!Number.isInteger(days)) throw new RangeError('days debe ser entero');
    const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
    return make(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  },

  /** Suma días hábiles (lunes a viernes) en Lima (US23 crit. 4: 5 días hábiles de gracia). */
  addBusinessDays(date: BusinessDate, businessDays: number): BusinessDate {
    if (!Number.isInteger(businessDays) || businessDays < 0) {
      throw new RangeError('businessDays debe ser un entero no negativo');
    }
    let current = date;
    let remaining = businessDays;
    while (remaining > 0) {
      current = BusinessDate.addDays(current, 1);
      const dayOfWeek = new Date(
        Date.UTC(current.year, current.month - 1, current.day),
      ).getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        remaining -= 1;
      }
    }
    return current;
  },

  /** Días calendario enteros de `from` a `to` (`to - from`). */
  daysBetween(from: BusinessDate, to: BusinessDate): number {
    const startFrom = Date.UTC(from.year, from.month - 1, from.day);
    const startTo = Date.UTC(to.year, to.month - 1, to.day);
    return Math.round((startTo - startFrom) / (24 * 60 * 60 * 1000));
  },

  isLastDayOfFebruary(date: BusinessDate): boolean {
    return date.month === 2 && new Date(Date.UTC(date.year, 1, date.day + 1)).getUTCMonth() === 2;
  },

  compare(a: BusinessDate, b: BusinessDate): -1 | 0 | 1 {
    const ka = a.year * 10_000 + a.month * 100 + a.day;
    const kb = b.year * 10_000 + b.month * 100 + b.day;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  },

  toISO(date: BusinessDate): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
  },
};
