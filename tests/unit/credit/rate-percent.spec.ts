import { describe, expect, it } from 'vitest';
import { RatePercent } from '@/core/domain/credit/rate-percent';

describe('RatePercent', () => {
  it('convierte el porcentaje que escribe el dueño a la fracción de NUMERIC(7, 4)', () => {
    expect(RatePercent.toFraction('24')).toEqual({ ok: true, value: '0.2400' });
    expect(RatePercent.toFraction('3.5')).toEqual({ ok: true, value: '0.0350' });
    expect(RatePercent.toFraction(' 114,13 ')).toEqual({ ok: true, value: '1.1413' });
  });

  it('acepta 0 % para vecinos de confianza (US06 crit. 5)', () => {
    expect(RatePercent.toFraction('0')).toEqual({ ok: true, value: '0.0000' });
  });

  it('rechaza negativos, texto, más de 2 decimales y valores que no caben', () => {
    for (const raw of ['-1', 'veinte', '3.555', '100000']) {
      expect(RatePercent.toFraction(raw)).toEqual({ ok: false, error: 'RATE_PERCENT_INVALID' });
    }
  });

  it('muestra la fracción guardada como porcentaje con 2 decimales', () => {
    expect(RatePercent.fromFraction('0.0350')).toBe('3.50');
    expect(RatePercent.fromFraction('1.1413')).toBe('114.13');
  });
});
