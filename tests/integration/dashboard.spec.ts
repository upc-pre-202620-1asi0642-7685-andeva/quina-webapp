import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import { closeDb } from '@/infrastructure/db/connection';
import { DrizzleChargeResolutionRepository } from '@/infrastructure/db/collections/drizzle-charge-resolution-repository';
import { loadDailySales } from '@/infrastructure/db/queries/sales';
import { creditCharges, sales } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { fiar, neighbor, product, storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

const charges = new ResolveChargeUseCase(new DrizzleChargeResolutionRepository());

describe('ventas de la semana en Inicio contra PostgreSQL', () => {
  it('agrupa por día de Lima, separa contado y fiado, rellena días en cero y no cuenta fiados anulados', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);

    await fiar(ctx, rosa.customerId, milk, new Date('2026-09-15T15:00:00Z'));
    const wrong = await fiar(
      ctx,
      rosa.customerId,
      milk,
      new Date('2026-09-17T15:00:00Z'),
      { mode: 'SINGLE' },
      '2',
    );
    const chargeId = await withTenant(ctx.storeId, async (tx) => {
      const [row] = await tx
        .select({ id: creditCharges.id })
        .from(creditCharges)
        .where(eq(creditCharges.saleId, wrong.saleId));
      return row!.id;
    });
    const voidAt = new Date('2026-09-19T15:00:00Z');
    const base = { storeId: ctx.storeId, userId: ctx.ownerId, chargeId, now: voidAt };
    expect(await charges.object({ ...base, note: 'No lo sacó' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await charges.void({ ...base, reason: 'Se cobró dos veces' })).ok).toBe(true);

    await withTenant(ctx.storeId, (tx) => {
      const cash = (amount: string, saleDate: string) => ({
        storeId: ctx.storeId,
        userIdCashier: ctx.ownerId,
        saleModality: 'CASH',
        paymentMethod: 'CASH',
        totalAmount: amount,
        totalCost: '0.00',
        profitMargin: amount,
        saleDate: new Date(saleDate),
      });
      return tx.insert(sales).values([
        cash('10.00', '2026-09-19T04:30:00Z'), // 18 de setiembre, 23:30 en Lima
        cash('20.00', '2026-09-19T05:30:00Z'), // 19 de setiembre, 00:30 en Lima
        cash('999.00', '2026-09-12T15:00:00Z'), // fuera de los 7 días
      ]);
    });

    expect(await loadDailySales(ctx.storeId, voidAt)).toEqual([
      { day: '2026-09-13', cash: '0.00', credit: '0.00' },
      { day: '2026-09-14', cash: '0.00', credit: '0.00' },
      { day: '2026-09-15', cash: '0.00', credit: '25.00' },
      { day: '2026-09-16', cash: '0.00', credit: '0.00' },
      { day: '2026-09-17', cash: '0.00', credit: '0.00' },
      { day: '2026-09-18', cash: '10.00', credit: '0.00' },
      { day: '2026-09-19', cash: '20.00', credit: '0.00' },
    ]);
  });
});
