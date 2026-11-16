import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import { closeDb } from '@/infrastructure/db/connection';
import { DrizzleChargeResolutionRepository } from '@/infrastructure/db/collections/drizzle-charge-resolution-repository';
import {
  loadDailyCashFlow,
  loadDailyPerformance,
  loadRecentSales,
  loadSalesByPaymentMethod,
  loadTopProducts,
} from '@/infrastructure/db/queries/dashboard-analytics';
import {
  creditAccounts,
  creditCharges,
  debtPayments,
  purchases,
  saleItems,
  sales,
  settlementCycles,
  suppliers,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { fiar, neighbor, product, storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

const charges = new ResolveChargeUseCase(new DrizzleChargeResolutionRepository());

describe('analítica avanzada del Dashboard contra PostgreSQL', () => {
  it('calcula ingresos reales (contado + cobranzas) vs compras, medios de pago, top productos y ventas recientes', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const aceite = await product(ctx, { name: 'Aceite Primor 900mL', price: '12.00', stock: '50' });
    const rosa = await neighbor(ctx);

    // 1. Fiado válido de S/ 24.00 el 16 de setiembre (NO entra a ingresos reales hasta cobrarse)
    await fiar(
      ctx,
      rosa.customerId,
      aceite,
      new Date('2026-09-16T15:00:00Z'),
      { mode: 'SINGLE' },
      '2',
    );

    // 2. Fiado anulado el 17 de setiembre (NO debe contarse en nada)
    const wrong = await fiar(
      ctx,
      rosa.customerId,
      aceite,
      new Date('2026-09-17T15:00:00Z'),
      { mode: 'SINGLE' },
      '3',
    );
    const chargeId = await withTenant(ctx.storeId, async (tx) => {
      const [row] = await tx
        .select({ id: creditCharges.id })
        .from(creditCharges)
        .where(eq(creditCharges.saleId, wrong.saleId));
      return row!.id;
    });
    const now = new Date('2026-09-19T18:00:00Z');
    await charges.object({
      storeId: ctx.storeId,
      userId: ctx.ownerId,
      chargeId,
      now,
      note: 'Error',
    });
    await charges.void({
      storeId: ctx.storeId,
      userId: ctx.ownerId,
      chargeId,
      now,
      reason: 'Anulado',
    });

    // 3. Ventas al contado (Efectivo y Yape), pago de fiado recibido y una compra a proveedor
    await withTenant(ctx.storeId, async (tx) => {
      const [cashSale] = await tx
        .insert(sales)
        .values({
          storeId: ctx.storeId,
          userIdCashier: ctx.ownerId,
          saleModality: 'CASH',
          paymentMethod: 'YAPE',
          totalAmount: '36.00',
          totalCost: '24.00',
          profitMargin: '12.00',
          saleDate: new Date('2026-09-19T05:30:00Z'), // 19 setiembre 00:30 Lima
        })
        .returning({ id: sales.id });

      await tx.insert(saleItems).values({
        storeId: ctx.storeId,
        saleId: cashSale!.id,
        productId: aceite,
        quantity: '3.000',
        unitPrice: '12.00',
        unitCostSnapshot: '8.0000',
        subtotal: '36.00',
      });

      const [cycle] = await tx
        .select({ id: settlementCycles.id })
        .from(settlementCycles)
        .where(eq(settlementCycles.creditAccountId, rosa.accountId))
        .limit(1);

      await tx.insert(debtPayments).values({
        storeId: ctx.storeId,
        creditAccountId: rosa.accountId,
        settlementCycleId: cycle!.id,
        userIdCollector: ctx.ownerId,
        paymentMethod: 'CASH',
        amountPaid: '15.00',
        principalPaid: '15.00',
        paymentDate: new Date('2026-09-19T16:00:00Z'), // 19 setiembre Lima
        receiptNumber: 'REC-001',
      });

      const [sup] = await tx
        .insert(suppliers)
        .values({
          storeId: ctx.storeId,
          taxIdNumber: '20555555551',
          tradeName: 'Distribuidora Sur',
        })
        .returning({ id: suppliers.id });

      await tx.insert(purchases).values({
        storeId: ctx.storeId,
        supplierId: sup!.id,
        userId: ctx.ownerId,
        documentType: 'FACTURA',
        documentNumber: 'F001-12',
        issueDate: '2026-09-19',
        totalAmount: '40.00',
      });

      // Mantener cuenta consistente aunque no haga falta para la query
      await tx
        .update(creditAccounts)
        .set({ currentBalance: '9.00' })
        .where(eq(creditAccounts.id, rosa.accountId));
    });

    const cashFlow = await loadDailyCashFlow(ctx.storeId, now, 7);
    const sep16 = cashFlow.find((d) => d.day === '2026-09-16');
    const sep19 = cashFlow.find((d) => d.day === '2026-09-19');
    expect(sep16).toEqual({
      day: '2026-09-16',
      cashSales: '0.00',
      debtCollections: '0.00',
      realIncome: '0.00',
      purchases: '0.00',
      netFlow: '0.00',
    });
    // 36.00 (Yape contado) + 15.00 (cobranza) = 51.00 realIncome; 40.00 purchases => +11.00 netFlow
    expect(sep19).toEqual({
      day: '2026-09-19',
      cashSales: '36.00',
      debtCollections: '15.00',
      realIncome: '51.00',
      purchases: '40.00',
      netFlow: '11.00',
    });

    const perf = await loadDailyPerformance(ctx.storeId, now, 7);
    expect(perf.find((d) => d.day === '2026-09-17')).toEqual({
      day: '2026-09-17',
      cash: '0.00',
      credit: '0.00',
      total: '0.00',
      grossMargin: '0.00',
    });
    expect(perf.find((d) => d.day === '2026-09-19')).toEqual({
      day: '2026-09-19',
      cash: '36.00',
      credit: '0.00',
      total: '36.00',
      grossMargin: '12.00',
    });

    const methods = await loadSalesByPaymentMethod(ctx.storeId, now);
    expect(methods.total7Days).toBe('60.00'); // 36 YAPE + 24 CREDIT (fiado anulado excluido)
    expect(methods.last7Days.find((m) => m.method === 'YAPE')).toEqual({
      method: 'YAPE',
      total: '36.00',
      count: 1,
    });
    expect(methods.last7Days.find((m) => m.method === 'CREDIT')).toEqual({
      method: 'CREDIT',
      total: '24.00',
      count: 1,
    });

    const top = await loadTopProducts(ctx.storeId, now, 30, 5);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({
      name: 'Aceite Primor 900mL',
      unitCode: 'UND',
      quantitySold: '5.000',
      revenue: '60.00',
    });

    const recent = await loadRecentSales(ctx.storeId, 5);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.paymentMethod).toBe('YAPE');
    expect(recent[1]!.customerName).toBe('Rosa Quispe');
  });
});
