import { and, desc, eq, gte, lte, notExists, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type {
  CategorySalesRow,
  DailyReportPoint,
  PaymentMethodBreakdown,
  ProductSalesRow,
  ReportAnalytics,
  ReportSummary,
} from '@/core/domain/analytics/report';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import {
  categories,
  creditChargeVoids,
  debtPayments,
  products,
  purchases,
  saleItems,
  sales,
  units,
} from '../schema';
import { withTenant } from '../with-tenant';

const PAYMENT_METHODS = ['CASH', 'YAPE', 'PLIN', 'CARD', 'CREDIT'] as const;

// La suma sale de PostgreSQL como texto: nunca pasa por `number`
const total = (column: AnyColumn, filter?: SQL) =>
  filter
    ? sql<string>`coalesce(sum(${column}) filter (where ${filter}), 0)::numeric(12, 2)::text`
    : sql<string>`coalesce(sum(${column}), 0)::numeric(12, 2)::text`;

/**
 * US20 crit. 1 (decisión D7 del Plan 8): ventas al contado y fiadas sin las
 * anuladas, costo y margen de lo vendido, e intereses efectivamente cobrados
 * en el rango, todo en soles y por días de Lima.
 */
export async function loadReport(
  storeId: string,
  from: BusinessDate,
  to: BusinessDate,
): Promise<ReportSummary> {
  const start = BusinessDate.startInstant(from);
  const end = BusinessDate.endInstant(to);
  return withTenant(storeId, async (tx) => {
    const [sold] = await tx
      .select({
        cashSales: total(sales.totalAmount, sql`${sales.saleModality} = 'CASH'`),
        creditSales: total(sales.totalAmount, sql`${sales.saleModality} <> 'CASH'`),
        costOfSales: total(sales.totalCost),
        grossMargin: total(sales.profitMargin),
        salesCount: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, start),
          lte(sales.saleDate, end),
          // Un fiado anulado no fue una venta (Plan 4, P2)
          notExists(
            tx
              .select({ id: creditChargeVoids.id })
              .from(creditChargeVoids)
              .where(eq(creditChargeVoids.saleId, sales.id)),
          ),
        ),
      );
    const [collected] = await tx
      .select({
        compensatoryInterest: total(debtPayments.compensatoryInterestPaid),
        moratoryInterest: total(debtPayments.moratoryInterestPaid),
      })
      .from(debtPayments)
      .where(
        and(
          eq(debtPayments.storeId, storeId),
          gte(debtPayments.paymentDate, start),
          lte(debtPayments.paymentDate, end),
        ),
      );
    return {
      from: BusinessDate.toISO(from),
      to: BusinessDate.toISO(to),
      cashSales: sold?.cashSales ?? '0.00',
      creditSales: sold?.creditSales ?? '0.00',
      costOfSales: sold?.costOfSales ?? '0.00',
      grossMargin: sold?.grossMargin ?? '0.00',
      salesCount: sold?.salesCount ?? 0,
      compensatoryInterest: collected?.compensatoryInterest ?? '0.00',
      moratoryInterest: collected?.moratoryInterest ?? '0.00',
    };
  });
}

/**
 * Analítica ejecutiva del reporte: comparativa contra el período anterior de
 * igual duración, cobranzas reales, compras, serie diaria de ventas y flujo,
 * desglose por medio de pago, top 10 productos y ventas por categoría (todo en
 * soles y días de `America/Lima`, sin fiados anulados).
 */
export async function loadReportAnalytics(
  storeId: string,
  from: BusinessDate,
  to: BusinessDate,
): Promise<ReportAnalytics> {
  const start = BusinessDate.startInstant(from);
  const end = BusinessDate.endInstant(to);
  const fromISO = BusinessDate.toISO(from);
  const toISO = BusinessDate.toISO(to);

  const spanDays = BusinessDate.daysBetween(from, to) + 1;
  const prevTo = BusinessDate.addDays(from, -1);
  const prevFrom = BusinessDate.addDays(prevTo, -(spanDays - 1));
  const prevStart = BusinessDate.startInstant(prevFrom);
  const prevEnd = BusinessDate.endInstant(prevTo);

  const saleDay = sql<string>`to_char(${sales.saleDate} at time zone 'America/Lima', 'YYYY-MM-DD')`;
  const payDay = sql<string>`to_char(${debtPayments.paymentDate} at time zone 'America/Lima', 'YYYY-MM-DD')`;
  const purchaseDay = sql<string>`to_char(${purchases.issueDate}, 'YYYY-MM-DD')`;
  const itemCost = sql<string>`coalesce(sum(${saleItems.quantity} * ${saleItems.unitCostSnapshot}), 0)::numeric(12, 2)::text`;
  const itemQty = sql<string>`coalesce(sum(${saleItems.quantity}), 0)::numeric(10, 3)::text`;

  return withTenant(storeId, async (tx) => {
    const notVoided = notExists(
      tx
        .select({ id: creditChargeVoids.id })
        .from(creditChargeVoids)
        .where(eq(creditChargeVoids.saleId, sales.id)),
    );

    const [prevSold] = await tx
      .select({
        cashSales: total(sales.totalAmount, sql`${sales.saleModality} = 'CASH'`),
        creditSales: total(sales.totalAmount, sql`${sales.saleModality} <> 'CASH'`),
        costOfSales: total(sales.totalCost),
        grossMargin: total(sales.profitMargin),
        salesCount: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, prevStart),
          lte(sales.saleDate, prevEnd),
          notVoided,
        ),
      );

    const [prevCollected] = await tx
      .select({
        compensatoryInterest: total(debtPayments.compensatoryInterestPaid),
        moratoryInterest: total(debtPayments.moratoryInterestPaid),
      })
      .from(debtPayments)
      .where(
        and(
          eq(debtPayments.storeId, storeId),
          gte(debtPayments.paymentDate, prevStart),
          lte(debtPayments.paymentDate, prevEnd),
        ),
      );

    const [collectionsRow] = await tx
      .select({
        totalCollected: total(debtPayments.amountPaid),
        principalCollected: total(debtPayments.principalPaid),
        paymentsCount: sql<number>`count(*)::int`,
      })
      .from(debtPayments)
      .where(
        and(
          eq(debtPayments.storeId, storeId),
          gte(debtPayments.paymentDate, start),
          lte(debtPayments.paymentDate, end),
        ),
      );

    const dailySalesRows = await tx
      .select({
        day: saleDay,
        cashSales: total(sales.totalAmount, sql`${sales.saleModality} = 'CASH'`),
        creditSales: total(sales.totalAmount, sql`${sales.saleModality} <> 'CASH'`),
        grossMargin: total(sales.profitMargin),
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, start),
          lte(sales.saleDate, end),
          notVoided,
        ),
      )
      .groupBy(saleDay);

    const dailyPaymentRows = await tx
      .select({
        day: payDay,
        total: total(debtPayments.amountPaid),
      })
      .from(debtPayments)
      .where(
        and(
          eq(debtPayments.storeId, storeId),
          gte(debtPayments.paymentDate, start),
          lte(debtPayments.paymentDate, end),
        ),
      )
      .groupBy(payDay);

    const dailyPurchaseRows = await tx
      .select({
        day: purchaseDay,
        total: total(purchases.totalAmount),
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.storeId, storeId),
          gte(purchases.issueDate, fromISO),
          lte(purchases.issueDate, toISO),
        ),
      )
      .groupBy(purchaseDay);

    const methodRows = await tx
      .select({
        method: sales.paymentMethod,
        total: total(sales.totalAmount),
        count: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, start),
          lte(sales.saleDate, end),
          notVoided,
        ),
      )
      .groupBy(sales.paymentMethod);

    const topProductRows = await tx
      .select({
        productId: products.id,
        name: products.name,
        categoryName: categories.name,
        unitCode: units.code,
        quantitySold: itemQty,
        revenue: total(saleItems.subtotal),
        cost: itemCost,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(
        and(
          eq(saleItems.storeId, storeId),
          gte(sales.saleDate, start),
          lte(sales.saleDate, end),
          notVoided,
        ),
      )
      .groupBy(products.id, products.name, categories.name, units.code)
      .orderBy(desc(sql`sum(${saleItems.subtotal})`), products.name)
      .limit(10);

    const categoryRows = await tx
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        revenue: total(saleItems.subtotal),
        cost: itemCost,
        unitsSold: itemQty,
        productsCount: sql<number>`count(distinct ${saleItems.productId})::int`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(saleItems.storeId, storeId),
          gte(sales.saleDate, start),
          lte(sales.saleDate, end),
          notVoided,
        ),
      )
      .groupBy(categories.id, categories.name)
      .orderBy(desc(sql`sum(${saleItems.subtotal})`));

    const salesByDay = new Map(dailySalesRows.map((r) => [r.day, r]));
    const payByDay = new Map(dailyPaymentRows.map((r) => [r.day, r.total]));
    const buyByDay = new Map(dailyPurchaseRows.map((r) => [r.day, r.total]));

    const dailySeries: DailyReportPoint[] = Array.from({ length: spanDays }, (_, i) => {
      const iso = BusinessDate.toISO(BusinessDate.addDays(from, i));
      const s = salesByDay.get(iso);
      const cashSales = s?.cashSales ?? '0.00';
      const creditSales = s?.creditSales ?? '0.00';
      const totalSales = Money.of(cashSales, 'PEN').plus(Money.of(creditSales, 'PEN')).toFixed2();
      const debtCollections = payByDay.get(iso) ?? '0.00';
      const purchasesDay = buyByDay.get(iso) ?? '0.00';
      const netCashFlow = Money.of(cashSales, 'PEN')
        .plus(Money.of(debtCollections, 'PEN'))
        .minus(Money.of(purchasesDay, 'PEN'))
        .toFixed2();
      return {
        day: iso,
        cashSales,
        creditSales,
        totalSales,
        grossMargin: s?.grossMargin ?? '0.00',
        debtCollections,
        purchases: purchasesDay,
        netCashFlow,
      };
    });

    const byMethod = new Map(methodRows.map((r) => [r.method, r]));
    const paymentMethods: PaymentMethodBreakdown[] = PAYMENT_METHODS.map((method) => {
      const row = byMethod.get(method);
      return {
        method,
        total: row?.total ?? '0.00',
        count: row?.count ?? 0,
      };
    });

    const topProducts: ProductSalesRow[] = topProductRows.map((r) => ({
      productId: r.productId,
      name: r.name,
      categoryName: r.categoryName ?? null,
      unitCode: r.unitCode,
      quantitySold: r.quantitySold,
      revenue: r.revenue,
      cost: r.cost,
      margin: Money.of(r.revenue, 'PEN').minus(Money.of(r.cost, 'PEN')).toFixed2(),
    }));

    const byCategory: CategorySalesRow[] = categoryRows.map((r) => ({
      categoryId: r.categoryId ?? null,
      categoryName: r.categoryName ?? null,
      revenue: r.revenue,
      cost: r.cost,
      margin: Money.of(r.revenue, 'PEN').minus(Money.of(r.cost, 'PEN')).toFixed2(),
      unitsSold: r.unitsSold,
      productsCount: r.productsCount,
    }));

    return {
      previousSummary: {
        from: BusinessDate.toISO(prevFrom),
        to: BusinessDate.toISO(prevTo),
        cashSales: prevSold?.cashSales ?? '0.00',
        creditSales: prevSold?.creditSales ?? '0.00',
        costOfSales: prevSold?.costOfSales ?? '0.00',
        grossMargin: prevSold?.grossMargin ?? '0.00',
        salesCount: prevSold?.salesCount ?? 0,
        compensatoryInterest: prevCollected?.compensatoryInterest ?? '0.00',
        moratoryInterest: prevCollected?.moratoryInterest ?? '0.00',
      },
      collections: {
        totalCollected: collectionsRow?.totalCollected ?? '0.00',
        principalCollected: collectionsRow?.principalCollected ?? '0.00',
        paymentsCount: collectionsRow?.paymentsCount ?? 0,
      },
      purchasesTotal: Money.sum(
        dailyPurchaseRows.map((r) => Money.of(r.total, 'PEN')),
        'PEN',
      ).toFixed2(),
      dailySeries,
      paymentMethods,
      topProducts,
      byCategory,
    };
  });
}
