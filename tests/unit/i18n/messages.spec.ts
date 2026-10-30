import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';
import qu from '../../../messages/qu.json';
import { formatDate } from '@/presentation/lib/format-date';

function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => collectKeys(v, prefix ? `${prefix}.${k}` : k));
}

describe('i18n messages y formatos peruanos', () => {
  it('es, en y qu tienen exactamente las mismas claves y qu conserva _draft', () => {
    expect(qu._draft).toBeTruthy();
    const strip = (m: Record<string, unknown>) => collectKeys(m).filter((k) => k !== '_draft');
    expect(strip(en)).toEqual(strip(es));
    expect(strip(qu)).toEqual(strip(es));
  });

  it('formatDate formatea en es-PE y America/Lima sin punto en el mes', () => {
    expect(formatDate(new Date('2026-11-13T05:00:00Z'))).toBe('13 nov 2026');
    expect(formatDate(new Date('2026-11-05T05:00:00Z'))).toBe('5 nov 2026');
  });
});
