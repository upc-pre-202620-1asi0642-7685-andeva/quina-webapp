import { describe, expect, it } from 'vitest';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import qu from '../../../messages/qu.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('message files', () => {
  it('have identical key sets (ignoring the _draft marker)', () => {
    const strip = (m: Record<string, unknown>) => keys(m).filter((k) => k !== '_draft');
    expect(strip(en)).toEqual(strip(es));
    expect(strip(qu)).toEqual(strip(es));
  });
});
