import { describe, expect, it } from 'vitest';
import { BusinessDate } from '@/core/domain/shared/business-date';
import {
  detectReportPreset,
  parseReportRange,
  previousReportRange,
  resolveReportPreset,
} from '@/presentation/lib/report-range';

// 2026-11-16T04:00:00Z = 2026-11-15 23:00 en Lima (UTC-5)
const LIMA_LATE_NIGHT = new Date('2026-11-16T04:00:00Z');
const NOV_18 = new Date('2026-11-18T15:00:00Z');

describe('report-range helpers', () => {
  it('parseReportRange usa del día 1 del mes de Lima a hoy por defecto', () => {
    const range = parseReportRange(undefined, undefined, LIMA_LATE_NIGHT);
    expect(range).not.toBeNull();
    expect(BusinessDate.toISO(range!.from)).toBe('2026-11-01');
    expect(BusinessDate.toISO(range!.to)).toBe('2026-11-15');
  });

  it('parseReportRange rechaza rangos invertidos o mayores a 366 días', () => {
    expect(parseReportRange('2026-11-10', '2026-11-01', NOV_18)).toBeNull();
    expect(parseReportRange('2025-01-01', '2026-01-03', NOV_18)).toBeNull();
    expect(parseReportRange('2025-01-01', '2026-01-02', NOV_18)).not.toBeNull();
  });

  it('resolveReportPreset resuelve today, 7d, thisMonth y lastMonth en días de Lima', () => {
    const today = resolveReportPreset('today', NOV_18);
    expect([BusinessDate.toISO(today.from), BusinessDate.toISO(today.to)]).toEqual([
      '2026-11-18',
      '2026-11-18',
    ]);

    const seven = resolveReportPreset('7d', NOV_18);
    expect([BusinessDate.toISO(seven.from), BusinessDate.toISO(seven.to)]).toEqual([
      '2026-11-12',
      '2026-11-18',
    ]);

    const thisMonth = resolveReportPreset('thisMonth', NOV_18);
    expect([BusinessDate.toISO(thisMonth.from), BusinessDate.toISO(thisMonth.to)]).toEqual([
      '2026-11-01',
      '2026-11-18',
    ]);

    const lastMonth = resolveReportPreset('lastMonth', NOV_18);
    expect([BusinessDate.toISO(lastMonth.from), BusinessDate.toISO(lastMonth.to)]).toEqual([
      '2026-10-01',
      '2026-10-31',
    ]);

    // Cruce de año (enero -> diciembre del año anterior)
    const janLast = resolveReportPreset('lastMonth', new Date('2026-01-10T15:00:00Z'));
    expect([BusinessDate.toISO(janLast.from), BusinessDate.toISO(janLast.to)]).toEqual([
      '2025-12-01',
      '2025-12-31',
    ]);
  });

  it('detectReportPreset identifica el preset activo o custom', () => {
    expect(detectReportPreset(resolveReportPreset('thisMonth', NOV_18), NOV_18)).toBe('thisMonth');
    expect(detectReportPreset(resolveReportPreset('today', NOV_18), NOV_18)).toBe('today');
    expect(detectReportPreset(resolveReportPreset('7d', NOV_18), NOV_18)).toBe('7d');
    expect(detectReportPreset(resolveReportPreset('lastMonth', NOV_18), NOV_18)).toBe('lastMonth');
    expect(
      detectReportPreset(
        { from: BusinessDate.parse('2026-11-05'), to: BusinessDate.parse('2026-11-12') },
        NOV_18,
      ),
    ).toBe('custom');
  });

  it('previousReportRange calcula la ventana inmediata anterior de igual duración', () => {
    const singleDay = previousReportRange({
      from: BusinessDate.parse('2026-11-10'),
      to: BusinessDate.parse('2026-11-10'),
    });
    expect([BusinessDate.toISO(singleDay.from), BusinessDate.toISO(singleDay.to)]).toEqual([
      '2026-11-09',
      '2026-11-09',
    ]);

    const sevenDays = previousReportRange({
      from: BusinessDate.parse('2026-11-01'),
      to: BusinessDate.parse('2026-11-07'),
    });
    expect([BusinessDate.toISO(sevenDays.from), BusinessDate.toISO(sevenDays.to)]).toEqual([
      '2026-10-25',
      '2026-10-31',
    ]);
  });
});
