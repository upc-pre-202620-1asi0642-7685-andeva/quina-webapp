import { describe, expect, it } from 'vitest';
import { AddRusCapUseCase } from '@/core/application/platform/manage-platform';
import type { AddRusCapData, RusCapRepository } from '@/core/domain/ports/platform-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { rusMonth, rusProgress } from '@/core/domain/tax/rus';

const pen = (amount: string) => Money.of(amount, 'PEN');

describe('rusProgress (US21 crit. 3 y 4)', () => {
  it('bajo el 85 % no hay alerta', () => {
    expect(rusProgress(pen('4249.99'), pen('5000'))).toEqual({ level: 'ok', percent: 84 });
  });

  it('desde el 85 % se enciende la alerta preventiva', () => {
    expect(rusProgress(pen('4250'), pen('5000'))).toEqual({ level: 'warning', percent: 85 });
    expect(rusProgress(pen('5000'), pen('5000'))).toEqual({ level: 'warning', percent: 100 });
  });

  it('al pasar el tope la barra marca más de 100 %', () => {
    expect(rusProgress(pen('5000.01'), pen('5000'))).toEqual({ level: 'over', percent: 100 });
    expect(rusProgress(pen('12000'), pen('8000'))).toEqual({ level: 'over', percent: 150 });
  });
});

describe('rusMonth (US21 crit. 6)', () => {
  it('va del día 1 al último día del mes de Lima', () => {
    const { from, to } = rusMonth(new Date('2026-02-14T15:00:00Z'));
    expect(BusinessDate.toISO(from)).toBe('2026-02-01');
    expect(BusinessDate.toISO(to)).toBe('2026-02-28');
  });

  it('reinicia a las 00:00 de Lima del día 1, no a medianoche UTC', () => {
    // 2026-12-01 03:00 UTC todavía es 30 de noviembre en Lima
    expect(BusinessDate.toISO(rusMonth(new Date('2026-12-01T03:00:00Z')).from)).toBe('2026-11-01');
    expect(BusinessDate.toISO(rusMonth(new Date('2026-12-01T05:00:00Z')).from)).toBe('2026-12-01');
  });
});

class FakeRusCaps implements RusCapRepository {
  saved: AddRusCapData[] = [];
  async add(data: AddRusCapData) {
    this.saved.push(data);
    return 'OK' as const;
  }
}

describe('AddRusCapUseCase (US21 crit. 2)', () => {
  const base = { adminId: 'admin', category: 1 as const, validFrom: '2027-01-01' };

  it('normaliza los montos en soles', async () => {
    const caps = new FakeRusCaps();
    const result = await new AddRusCapUseCase(caps).execute({
      ...base,
      monthlyIncomeCap: '5,500',
      monthlyPurchasesCap: ' 5500.5 ',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(caps.saved[0]).toMatchObject({
      monthlyIncomeCap: '5500.00',
      monthlyPurchasesCap: '5500.50',
    });
  });

  it.each(['0', '-10', 'abc', '5000.123', ''])('rechaza el monto "%s"', async (amount) => {
    const caps = new FakeRusCaps();
    const result = await new AddRusCapUseCase(caps).execute({
      ...base,
      monthlyIncomeCap: amount,
      monthlyPurchasesCap: '5000',
    });
    expect(result).toEqual({ ok: false, error: 'AMOUNT_INVALID' });
    expect(caps.saved).toHaveLength(0);
  });

  it('rechaza una fecha inválida', async () => {
    const result = await new AddRusCapUseCase(new FakeRusCaps()).execute({
      ...base,
      validFrom: '2027-02-30',
      monthlyIncomeCap: '5000',
      monthlyPurchasesCap: '5000',
    });
    expect(result).toEqual({ ok: false, error: 'DATE_INVALID' });
  });
});
