import { describe, expect, it } from 'vitest';
import { days30360 } from '@/core/domain/finance/day-count';
import { BusinessDate } from '@/core/domain/shared/business-date';

const d = BusinessDate.parse;

describe('days30360', () => {
  it.each([
    ['2026-09-15', '2026-09-26', 11], // enunciado: compra antes del corte
    ['2026-09-22', '2026-10-26', 34], // US09: compra después del corte
    ['2026-01-15', '2026-01-31', 15], // el 31 cuenta como 30
    ['2026-01-31', '2026-03-01', 31],
    ['2026-12-26', '2027-01-26', 30], // cruce de año
    ['2026-02-20', '2026-02-28', 10], // febrero se completa hasta 30
    ['2028-02-28', '2028-02-29', 2], // bisiesto: el 29 es el último día
    ['2026-02-28', '2026-03-26', 26],
    ['2026-09-26', '2026-10-06', 10], // mora del juego de datos
    ['2026-09-26', '2026-09-26', 0],
  ])('%s → %s = %i días', (from, to, expected) => {
    expect(days30360(d(from), d(to))).toBe(expected);
  });

  it('es negativo si la fecha final es anterior', () => {
    expect(days30360(d('2026-09-26'), d('2026-09-20'))).toBe(-6);
  });
});

describe('BusinessDate', () => {
  it('toma el día de Lima (UTC−5) de un instante', () => {
    expect(BusinessDate.toISO(BusinessDate.fromInstant(new Date('2026-09-21T04:59:59.999Z')))).toBe(
      '2026-09-20',
    );
    expect(BusinessDate.toISO(BusinessDate.fromInstant(new Date('2026-09-21T05:00:00.000Z')))).toBe(
      '2026-09-21',
    );
  });

  it('expresa el inicio y el fin del día de Lima en UTC', () => {
    expect(BusinessDate.startInstant(d('2026-09-20')).toISOString()).toBe(
      '2026-09-20T05:00:00.000Z',
    );
    expect(BusinessDate.endInstant(d('2026-09-20')).toISOString()).toBe('2026-09-21T04:59:59.999Z');
  });

  it('suma meses cruzando el año', () => {
    expect(BusinessDate.toISO(BusinessDate.addMonths(d('2026-12-26'), 1))).toBe('2027-01-26');
    expect(BusinessDate.toISO(BusinessDate.addMonths(d('2026-09-26'), 3))).toBe('2026-12-26');
    expect(() => BusinessDate.addMonths(d('2026-01-31'), 1)).toThrow(RangeError);
  });

  it('reconoce el último día de febrero', () => {
    expect(BusinessDate.isLastDayOfFebruary(d('2026-02-28'))).toBe(true);
    expect(BusinessDate.isLastDayOfFebruary(d('2028-02-28'))).toBe(false);
    expect(BusinessDate.isLastDayOfFebruary(d('2028-02-29'))).toBe(true);
  });

  it('rechaza fechas que no existen', () => {
    expect(() => d('2026-02-30')).toThrow(RangeError);
    expect(() => d('2026-9-1')).toThrow(RangeError);
  });

  it('compara fechas', () => {
    expect(BusinessDate.compare(d('2026-09-20'), d('2026-09-21'))).toBe(-1);
    expect(BusinessDate.compare(d('2026-09-21'), d('2026-09-21'))).toBe(0);
    expect(BusinessDate.compare(d('2027-01-01'), d('2026-12-31'))).toBe(1);
  });
});
