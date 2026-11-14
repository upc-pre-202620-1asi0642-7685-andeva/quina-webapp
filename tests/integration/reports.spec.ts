import { afterAll, describe, expect, it } from 'vitest';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { closeDb } from '@/infrastructure/db/connection';
import { loadReport } from '@/infrastructure/db/queries/reports';
import { DrizzleAIQuotaRepository } from '@/infrastructure/db/repositories/drizzle-ai-quota-repository';
import { debtPayments, sales, settlementCycles } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { neighbor, storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

describe('reporte por rango (US20 crit. 1) contra PostgreSQL', () => {
  it('separa contado y fiado, costo y margen, e intereses cobrados en el rango', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const rosa = await neighbor(ctx);
    await withTenant(ctx.storeId, async (tx) => {
      const sale = (modality: string, amount: string, cost: string, saleDate: string) => ({
        storeId: ctx.storeId,
        userIdCashier: ctx.ownerId,
        customerId: modality === 'CASH' ? null : rosa.customerId,
        saleModality: modality,
        paymentMethod: modality === 'CASH' ? 'CASH' : 'CREDIT',
        totalAmount: amount,
        totalCost: cost,
        profitMargin: (Number(amount) - Number(cost)).toFixed(2),
        saleDate: new Date(saleDate),
      });
      await tx.insert(sales).values([
        sale('CASH', '100.00', '70.00', '2026-11-02T15:00:00Z'),
        sale('SINGLE_PAYMENT_CREDIT', '40.00', '30.00', '2026-11-05T15:00:00Z'),
        sale('CASH', '999.00', '1.00', '2026-10-31T15:00:00Z'), // fuera del rango
      ]);
      const [cycle] = await tx
        .insert(settlementCycles)
        .values({
          storeId: ctx.storeId,
          creditAccountId: rosa.accountId,
          cycleNumber: 1,
          periodYear: 2026,
          periodMonth: 10,
          cutOffDate: new Date('2026-10-21T04:59:59Z'),
          paymentDueDate: new Date('2026-10-27T04:59:59Z'),
          totalDue: '45.00',
          amountPaid: '45.00',
          status: 'PAID',
        })
        .returning({ id: settlementCycles.id });
      await tx.insert(debtPayments).values({
        storeId: ctx.storeId,
        creditAccountId: rosa.accountId,
        settlementCycleId: cycle!.id,
        userIdCollector: ctx.ownerId,
        paymentMethod: 'YAPE',
        amountPaid: '45.00',
        principalPaid: '40.00',
        compensatoryInterestPaid: '4.00',
        moratoryInterestPaid: '1.00',
        daysLate: 2,
        paymentDate: new Date('2026-11-03T15:00:00Z'),
        receiptNumber: `R-${cycle!.id.slice(0, 8)}`,
      });
    });

    expect(
      await loadReport(
        ctx.storeId,
        BusinessDate.parse('2026-11-01'),
        BusinessDate.parse('2026-11-13'),
      ),
    ).toEqual({
      from: '2026-11-01',
      to: '2026-11-13',
      cashSales: '100.00',
      creditSales: '40.00',
      costOfSales: '100.00',
      grossMargin: '40.00',
      salesCount: 2,
      compensatoryInterest: '4.00',
      moratoryInterest: '1.00',
    });
  });
});

describe('cuota mensual de IA (US20 crit. 4) contra PostgreSQL', () => {
  it('no deja pasar el tope ni con consultas simultáneas y devuelve la fallida', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const quotas = new DrizzleAIQuotaRepository();
    const period = { year: 2026, month: 11 };
    const now = new Date('2026-11-13T15:00:00Z');

    const results = await Promise.all([
      quotas.reserve(ctx.storeId, period, 1, now),
      quotas.reserve(ctx.storeId, period, 1, now),
    ]);
    expect(results.filter((r) => r === 1)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);

    await quotas.release(ctx.storeId, period);
    expect(await quotas.used(ctx.storeId, period)).toBe(0);
    // Un tope mayor (subida de plan) habilita más consultas en el mismo mes
    expect(await quotas.reserve(ctx.storeId, period, 20, now)).toBe(1);
  });
});
