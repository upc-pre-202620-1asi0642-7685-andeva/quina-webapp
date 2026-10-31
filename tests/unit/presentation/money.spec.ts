import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/presentation/components/money';

describe('formatMoney (DESIGN.md §10)', () => {
  it('formatea soles y dólares con separador de miles y 2 decimales', () => {
    expect(formatMoney('1234.5', 'PEN')).toBe('S/ 1,234.50');
    expect(formatMoney('150', 'PEN')).toBe('S/ 150.00');
    expect(formatMoney('1000000', 'USD')).toBe('US$ 1,000,000.00');
    expect(formatMoney('-12.3', 'PEN')).toBe('-S/ 12.30');
  });
});
