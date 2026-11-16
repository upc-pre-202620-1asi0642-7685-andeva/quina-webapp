import { afterAll, describe, expect, it } from 'vitest';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { closeDb } from '@/infrastructure/db/connection';
import { loadReport, loadReportAnalytics } from '@/infrastructure/db/queries/reports';
import { DrizzleAIQuotaRepository } from '@/infrastructure/db/repositories/drizzle-ai-quota-repository';
import {
  categories,
  creditCharges,
  creditChargeVoids,
  debtPayments,
  products,
  purchases,
  saleItems,
  sales,
  settlementCycles,
  suppliers,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { neighbor, product, storeWithOwner } from './support/seed';

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

describe('analítica ejecutiva del reporte (loadReportAnalytics) contra PostgreSQL', () => {
  it('calcula período anterior, cobranzas, compras, serie diaria, medios, productos y categorías sin fiados anulados', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const rosa = await neighbor(ctx);
    const lecheId = await product(ctx, { name: 'Leche Gloria', price: '5.00' });
    const panId = await product(ctx, { name: 'Pan francés', price: '1.00' });

    await withTenant(ctx.storeId, async (tx) => {
      const [lacteos] = await tx
        .insert(categories)
        .values({ storeId: ctx.storeId, name: 'Lácteos' })
        .returning({ id: categories.id });
      const { eq } = await import('drizzle-orm');
      await tx.update(products).set({ categoryId: lacteos!.id }).where(eq(products.id, lecheId));

      const [supplier] = await tx
        .insert(suppliers)
        .values({
          storeId: ctx.storeId,
          taxIdNumber: '20111222333',
          tradeName: 'Distribuidora Lima',
        })
        .returning({ id: suppliers.id });

      // Rango actual: 2026-11-10 a 2026-11-12 (3 días). Período anterior: 2026-11-07 a 2026-11-09.
      const [prevSale] = await tx
        .insert(sales)
        .values({
          storeId: ctx.storeId,
          userIdCashier: ctx.ownerId,
          customerId: null,
          saleModality: 'CASH',
          paymentMethod: 'CASH',
          totalAmount: '50.00',
          totalCost: '30.00',
          profitMargin: '20.00',
          saleDate: new Date('2026-11-08T15:00:00Z'),
        })
        .returning({ id: sales.id });

      const [sale1] = await tx
        .insert(sales)
        .values({
          storeId: ctx.storeId,
          userIdCashier: ctx.ownerId,
          customerId: null,
          saleModality: 'CASH',
          paymentMethod: 'YAPE',
          totalAmount: '25.00',
          totalCost: '15.00',
          profitMargin: '10.00',
          saleDate: new Date('2026-11-10T16:00:00Z'),
        })
        .returning({ id: sales.id });

      const [sale2] = await tx
        .insert(sales)
        .values({
          storeId: ctx.storeId,
          userIdCashier: ctx.ownerId,
          customerId: rosa.customerId,
          saleModality: 'SINGLE_PAYMENT_CREDIT',
          paymentMethod: 'CREDIT',
          totalAmount: '10.00',
          totalCost: '6.00',
          profitMargin: '4.00',
          saleDate: new Date('2026-11-11T16:00:00Z'),
        })
        .returning({ id: sales.id });

      // Fiado anulado: NO debe aparecer en serie diaria, medios de pago, topProducts ni byCategory
      const [voidedSale] = await tx
        .insert(sales)
        .values({
          storeId: ctx.storeId,
          userIdCashier: ctx.ownerId,
          customerId: rosa.customerId,
          saleModality: 'SINGLE_PAYMENT_CREDIT',
          paymentMethod: 'CREDIT',
          totalAmount: '99.00',
          totalCost: '50.00',
          profitMargin: '49.00',
          saleDate: new Date('2026-11-12T16:00:00Z'),
        })
        .returning({ id: sales.id });

      await tx.insert(saleItems).values([
        {
          storeId: ctx.storeId,
          saleId: prevSale!.id,
          productId: lecheId,
          quantity: '10.000',
          unitPrice: '5.00',
          unitCostSnapshot: '3.0000',
          subtotal: '50.00',
        },
        {
          storeId: ctx.storeId,
          saleId: sale1!.id,
          productId: lecheId,
          quantity: '5.000',
          unitPrice: '5.00',
          unitCostSnapshot: '3.0000',
          subtotal: '25.00',
        },
        {
          storeId: ctx.storeId,
          saleId: sale2!.id,
          productId: panId,
          quantity: '10.000',
          unitPrice: '1.00',
          unitCostSnapshot: '0.6000',
          subtotal: '10.00',
        },
        {
          storeId: ctx.storeId,
          saleId: voidedSale!.id,
          productId: panId,
          quantity: '99.000',
          unitPrice: '1.00',
          unitCostSnapshot: '0.5000',
          subtotal: '99.00',
        },
      ]);

      const [cycle] = await tx
        .insert(settlementCycles)
        .values({
          storeId: ctx.storeId,
          creditAccountId: rosa.accountId,
          cycleNumber: 1,
          periodYear: 2026,
          periodMonth: 11,
          cutOffDate: new Date('2026-11-21T04:59:59Z'),
          paymentDueDate: new Date('2026-11-27T04:59:59Z'),
          totalDue: '15.00',
          amountPaid: '15.00',
          status: 'PAID',
        })
        .returning({ id: settlementCycles.id });

      const [charge] = await tx
        .insert(creditCharges)
        .values({
          storeId: ctx.storeId,
          creditAccountId: rosa.accountId,
          saleId: voidedSale!.id,
          settlementCycleId: cycle!.id,
          chargeModality: 'SINGLE_PAYMENT',
          purchaseDate: new Date('2026-11-12T16:00:00Z'),
          principalAmount: '99.00',
          compensatoryRateType: 'EFFECTIVE',
          compensatoryRateValue: '0.0300',
          compensatoryPeriod: 'MONTHLY',
          moratoryRateType: 'EFFECTIVE',
          moratoryRateValue: '0.0010',
          moratoryPeriod: 'DAILY',
          status: 'VOIDED',
        })
        .returning({ id: creditCharges.id });

      await tx.insert(creditChargeVoids).values({
        storeId: ctx.storeId,
        creditChargeId: charge!.id,
        saleId: voidedSale!.id,
        userId: ctx.ownerId,
        appliedCycleId: cycle!.id,
        voidedAmount: '99.00',
        reason: 'Error de registro',
      });

      await tx.insert(debtPayments).values({
        storeId: ctx.storeId,
        creditAccountId: rosa.accountId,
        settlementCycleId: cycle!.id,
        userIdCollector: ctx.ownerId,
        paymentMethod: 'CASH',
        amountPaid: '15.00',
        principalPaid: '12.00',
        compensatoryInterestPaid: '2.00',
        moratoryInterestPaid: '1.00',
        daysLate: 1,
        paymentDate: new Date('2026-11-11T17:00:00Z'),
        receiptNumber: `R-${cycle!.id.slice(0, 8)}`,
      });

      await tx.insert(purchases).values({
        storeId: ctx.storeId,
        supplierId: supplier!.id,
        userId: ctx.ownerId,
        documentType: 'BOLETA',
        documentNumber: '001-000123',
        issueDate: '2026-11-11',
        totalAmount: '18.00',
      });
    });

    const analytics = await loadReportAnalytics(
      ctx.storeId,
      BusinessDate.parse('2026-11-10'),
      BusinessDate.parse('2026-11-12'),
    );

    expect(analytics.previousSummary).toEqual({
      from: '2026-11-07',
      to: '2026-11-09',
      cashSales: '50.00',
      creditSales: '0.00',
      costOfSales: '30.00',
      grossMargin: '20.00',
      salesCount: 1,
      compensatoryInterest: '0.00',
      moratoryInterest: '0.00',
    });

    expect(analytics.collections).toEqual({
      totalCollected: '15.00',
      principalCollected: '12.00',
      paymentsCount: 1,
    });
    expect(analytics.purchasesTotal).toBe('18.00');

    expect(analytics.dailySeries).toEqual([
      {
        day: '2026-11-10',
        cashSales: '25.00',
        creditSales: '0.00',
        totalSales: '25.00',
        grossMargin: '10.00',
        debtCollections: '0.00',
        purchases: '0.00',
        netCashFlow: '25.00',
      },
      {
        day: '2026-11-11',
        cashSales: '0.00',
        creditSales: '10.00',
        totalSales: '10.00',
        grossMargin: '4.00',
        debtCollections: '15.00',
        purchases: '18.00',
        netCashFlow: '-3.00',
      },
      {
        day: '2026-11-12',
        cashSales: '0.00',
        creditSales: '0.00',
        totalSales: '0.00',
        grossMargin: '0.00',
        debtCollections: '0.00',
        purchases: '0.00',
        netCashFlow: '0.00',
      },
    ]);

    expect(analytics.paymentMethods).toEqual([
      { method: 'CASH', total: '0.00', count: 0 },
      { method: 'YAPE', total: '25.00', count: 1 },
      { method: 'PLIN', total: '0.00', count: 0 },
      { method: 'CARD', total: '0.00', count: 0 },
      { method: 'CREDIT', total: '10.00', count: 1 },
    ]);

    expect(analytics.topProducts).toEqual([
      {
        productId: lecheId,
        name: 'Leche Gloria',
        categoryName: 'Lácteos',
        unitCode: 'UND',
        quantitySold: '5.000',
        revenue: '25.00',
        cost: '15.00',
        margin: '10.00',
      },
      {
        productId: panId,
        name: 'Pan francés',
        categoryName: null,
        unitCode: 'UND',
        quantitySold: '10.000',
        revenue: '10.00',
        cost: '6.00',
        margin: '4.00',
      },
    ]);

    expect(analytics.byCategory).toEqual([
      {
        categoryId: expect.any(String),
        categoryName: 'Lácteos',
        revenue: '25.00',
        cost: '15.00',
        margin: '10.00',
        unitsSold: '5.000',
        productsCount: 1,
      },
      {
        categoryId: null,
        categoryName: null,
        revenue: '10.00',
        cost: '6.00',
        margin: '4.00',
        unitsSold: '10.000',
        productsCount: 1,
      },
    ]);
  });
});
