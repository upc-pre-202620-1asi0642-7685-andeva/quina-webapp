import { describe, expect, it } from 'vitest';
import { Dec } from '@/core/domain/shared/decimal';
import { Money } from '@/core/domain/shared/money';

const pen = (amount: string) => Money.of(amount, 'PEN');

describe('Money', () => {
  it('suma sin errores de coma flotante', () => {
    expect(pen('0.10').plus(pen('0.20')).toFixed2()).toBe('0.30');
  });

  it('redondea a céntimos mitad hacia arriba', () => {
    expect(pen('2.675').toFixed2()).toBe('2.68');
    expect(pen('0.005').toFixed2()).toBe('0.01');
    expect(pen('0.004').toFixed2()).toBe('0.00');
    expect(pen('120').times(new Dec('0.0153094705')).toFixed2()).toBe('1.84');
  });

  it('siempre expone 2 decimales', () => {
    expect(pen('7').toFixed2()).toBe('7.00');
    expect(pen('7').toString()).toBe('PEN 7.00');
  });

  it('rechaza textos que no son montos', () => {
    expect(() => pen('12,50')).toThrow(RangeError);
    expect(() => pen('abc')).toThrow(RangeError);
    expect(() => pen('')).toThrow(RangeError);
  });

  it('no mezcla monedas', () => {
    expect(() => pen('1.00').plus(Money.of('1.00', 'USD'))).toThrow(TypeError);
  });

  it('reparte en proporción y la última parte absorbe el residuo', () => {
    const shares = pen('0.30').allocate([pen('25.80'), pen('40.22'), pen('10.03')]);
    expect(shares.map((s) => s.toFixed2())).toEqual(['0.10', '0.15', '0.05']);
    expect(Money.sum(shares, 'PEN').toFixed2()).toBe('0.30');
  });

  it('divide y compara', () => {
    expect(pen('100.00').dividedBy(3).toFixed2()).toBe('33.33');
    expect(pen('1.00').compare(pen('2.00'))).toBe(-1);
    expect(pen('1.00').equals(pen('1'))).toBe(true);
    expect(pen('0').isZero()).toBe(true);
    expect(pen('-1').isNegative()).toBe(true);
  });
});
