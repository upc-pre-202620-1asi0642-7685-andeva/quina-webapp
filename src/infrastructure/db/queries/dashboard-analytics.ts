import { and, desc, eq, gte, lte, notExists, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import {
  creditChargeVoids,
  customers,
  debtPayments,
  products,
  purchases,
  saleItems,
  sales,
  units,
} from '../schema';
import { withTenant } from '../with-tenant';

export type DailyCashFlow = {
  day: string;
  cashSales: string;
  debtCollections: string;
  realIncome: string;
  purchases: string;
  netFlow: string;
};

export type DailyPerformance = {
  day: string;
  cash: string;
  credit: string;
  total: string;
  grossMargin: string;
};

export type PaymentMethodSlice = {
  method: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'CREDIT';
  total: string;
  count: number;
};

export type SalesByPaymentMethodResult = {
  last7Days: PaymentMethodSlice[];
  last30Days: PaymentMethodSlice[];
  total7Days: string;
  total30Days: string;
};

export type TopProductRow = {
  productId: string;
  name: string;
  unitCode: string;
  quantitySold: string;
  revenue: string;
};

export type RecentSaleRow = {
  id: string;
  saleDate: Date;
  saleModality: string;
  paymentMethod: string;
  totalAmount: string;
  customerName: string | null;
};

const PAYMENT_METHODS = ['CASH', 'YAPE', 'PLIN', 'CARD', 'CREDIT'] as const;

const moneySum = (column: AnyColumn, filter?: SQL) =>
  filter
    ? sql<string>`coalesce(sum(${column}) filter (where ${filter}), 0)::numeric(12, 2)::text`
    : sql<string>`coalesce(sum(${column}), 0)::numeric(12, 2)::text`;

/**
 * Flujo de caja diario en Lima: ingresos reales (ventas al contado + cobranzas
 * recibidas de fiado) frente a compras registradas, sin contar fiados por cobrar
 * ni fiados anulados.
 */
export async function loadDailyCashFlow(
  storeId: string,
  now: Date,
  days = 30,
): Promise<DailyCashFlow[]> {
  const today = BusinessDate.fromInstant(now);
  const from = BusinessDate.addDays(today, -(days - 1));
  const start = BusinessDate.startInstant(from);
  const end = BusinessDate.endInstant(today);
  const fromISO = BusinessDate.toISO(from);
  const toISO = BusinessDate.toISO(today);

  const saleDay = sql<string>`to_char(${sales.saleDate} at time zone 'America/Lima', 'YYYY-MM-DD')`;
  const payDay = sql<string>`to_char(${debtPayments.paymentDate} at time zone 'America/Lima', 'YYYY-MM-DD')`;
  const purchaseDay = sql<string>`to_char(${purchases.issueDate}, 'YYYY-MM-DD')`;

  const [cashRows, paymentRows, purchaseRows] = await withTenant(storeId, async (tx) => {
    const c = await tx
      .select({
        day: saleDay,
        total: moneySum(sales.totalAmount),
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          eq(sales.saleModality, 'CASH'),
          gte(sales.saleDate, start),
          lte(sales.saleDate, end),
          notExists(
            tx
              .select({ id: creditChargeVoids.id })
              .from(creditChargeVoids)
              .where(eq(creditChargeVoids.saleId, sales.id)),
          ),
        ),
      )
      .groupBy(saleDay);

    const p = await tx
      .select({
        day: payDay,
        total: moneySum(debtPayments.amountPaid),
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

    const b = await tx
      .select({
        day: purchaseDay,
        total: moneySum(purchases.totalAmount),
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

    return [c, p, b] as const;
  });

  const cashMap = new Map(cashRows.map((r) => [r.day, r.total]));
  const payMap = new Map(paymentRows.map((r) => [r.day, r.total]));
  const buyMap = new Map(purchaseRows.map((r) => [r.day, r.total]));

  return Array.from({ length: days }, (_, i) => {
    const iso = BusinessDate.toISO(BusinessDate.addDays(from, i));
    const cashSales = cashMap.get(iso) ?? '0.00';
    const debtCollections = payMap.get(iso) ?? '0.00';
    const purchasesTotal = buyMap.get(iso) ?? '0.00';
    const realIncome = Money.of(cashSales, 'PEN').plus(Money.of(debtCollections, 'PEN')).toFixed2();
    const netFlow = Money.of(realIncome, 'PEN').minus(Money.of(purchasesTotal, 'PEN')).toFixed2();
    return {
      day: iso,
      cashSales,
      debtCollections,
      realIncome,
      purchases: purchasesTotal,
      netFlow,
    };
  });
}

/** Ventas al contado, fiado y margen bruto por día de Lima, excluyendo fiados anulados. */
export async function loadDailyPerformance(
  storeId: string,
  now: Date,
  days = 30,
): Promise<DailyPerformance[]> {
  const today = BusinessDate.fromInstant(now);
  const from = BusinessDate.addDays(today, -(days - 1));
  const day = sql<string>`to_char(${sales.saleDate} at time zone 'America/Lima', 'YYYY-MM-DD')`;

  const rows = await withTenant(storeId, (tx) =>
    tx
      .select({
        day,
        cash: moneySum(sales.totalAmount, sql`${sales.saleModality} = 'CASH'`),
        credit: moneySum(sales.totalAmount, sql`${sales.saleModality} <> 'CASH'`),
        grossMargin: moneySum(sales.profitMargin),
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, BusinessDate.startInstant(from)),
          lte(sales.saleDate, BusinessDate.endInstant(today)),
          notExists(
            tx
              .select({ id: creditChargeVoids.id })
              .from(creditChargeVoids)
              .where(eq(creditChargeVoids.saleId, sales.id)),
          ),
        ),
      )
      .groupBy(day),
  );

  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const iso = BusinessDate.toISO(BusinessDate.addDays(from, i));
    const row = byDay.get(iso);
    const cash = row?.cash ?? '0.00';
    const credit = row?.credit ?? '0.00';
    const total = Money.of(cash, 'PEN').plus(Money.of(credit, 'PEN')).toFixed2();
    return {
      day: iso,
      cash,
      credit,
      total,
      grossMargin: row?.grossMargin ?? '0.00',
    };
  });
}

/** Desglose de ventas por medio de pago (Efectivo, Yape, Plin, Tarjeta y Fiado) en 7 y 30 días. */
export async function loadSalesByPaymentMethod(
  storeId: string,
  now: Date,
): Promise<SalesByPaymentMethodResult> {
  const today = BusinessDate.fromInstant(now);
  const from30 = BusinessDate.startInstant(BusinessDate.addDays(today, -29));
  const from7 = BusinessDate.startInstant(BusinessDate.addDays(today, -6));
  const end = BusinessDate.endInstant(today);

  const in7 = gte(sales.saleDate, from7);

  const rows = await withTenant(storeId, (tx) =>
    tx
      .select({
        method: sales.paymentMethod,
        total30: moneySum(sales.totalAmount),
        count30: sql<number>`count(*)::int`,
        total7: moneySum(sales.totalAmount, in7),
        count7: sql<number>`count(*) filter (where ${in7})::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, from30),
          lte(sales.saleDate, end),
          notExists(
            tx
              .select({ id: creditChargeVoids.id })
              .from(creditChargeVoids)
              .where(eq(creditChargeVoids.saleId, sales.id)),
          ),
        ),
      )
      .groupBy(sales.paymentMethod),
  );

  const byMethod = new Map(rows.map((r) => [r.method, r]));
  const last7Days: PaymentMethodSlice[] = PAYMENT_METHODS.map((method) => {
    const row = byMethod.get(method);
    return { method, total: row?.total7 ?? '0.00', count: row?.count7 ?? 0 };
  });
  const last30Days: PaymentMethodSlice[] = PAYMENT_METHODS.map((method) => {
    const row = byMethod.get(method);
    return { method, total: row?.total30 ?? '0.00', count: row?.count30 ?? 0 };
  });

  return {
    last7Days,
    last30Days,
    total7Days: Money.sum(
      last7Days.map((s) => Money.of(s.total, 'PEN')),
      'PEN',
    ).toFixed2(),
    total30Days: Money.sum(
      last30Days.map((s) => Money.of(s.total, 'PEN')),
      'PEN',
    ).toFixed2(),
  };
}

/** Productos más vendidos en los últimos `days` días de Lima, ordenados por ingreso. */
export async function loadTopProducts(
  storeId: string,
  now: Date,
  days = 30,
  limit = 8,
): Promise<TopProductRow[]> {
  const today = BusinessDate.fromInstant(now);
  const from = BusinessDate.addDays(today, -(days - 1));
  const revenue = sql<string>`coalesce(sum(${saleItems.subtotal}), 0)::numeric(12, 2)::text`;
  const quantitySold = sql<string>`coalesce(sum(${saleItems.quantity}), 0)::numeric(10, 3)::text`;

  return withTenant(storeId, (tx) =>
    tx
      .select({
        productId: products.id,
        name: products.name,
        unitCode: units.code,
        quantitySold,
        revenue,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(
        and(
          eq(saleItems.storeId, storeId),
          gte(sales.saleDate, BusinessDate.startInstant(from)),
          lte(sales.saleDate, BusinessDate.endInstant(today)),
          notExists(
            tx
              .select({ id: creditChargeVoids.id })
              .from(creditChargeVoids)
              .where(eq(creditChargeVoids.saleId, sales.id)),
          ),
        ),
      )
      .groupBy(products.id, products.name, units.code)
      .orderBy(desc(sql`sum(${saleItems.subtotal})`))
      .limit(limit),
  );
}

/** Últimas ventas completadas de la tienda (sin fiados anulados). */
export async function loadRecentSales(storeId: string, limit = 8): Promise<RecentSaleRow[]> {
  const rows = await withTenant(storeId, (tx) =>
    tx
      .select({
        id: sales.id,
        saleDate: sales.saleDate,
        saleModality: sales.saleModality,
        paymentMethod: sales.paymentMethod,
        totalAmount: sales.totalAmount,
        firstName: customers.firstName,
        lastName: customers.lastName,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(
        and(
          eq(sales.storeId, storeId),
          notExists(
            tx
              .select({ id: creditChargeVoids.id })
              .from(creditChargeVoids)
              .where(eq(creditChargeVoids.saleId, sales.id)),
          ),
        ),
      )
      .orderBy(desc(sales.saleDate))
      .limit(limit),
  );

  return rows.map((r) => ({
    id: r.id,
    saleDate: r.saleDate,
    saleModality: r.saleModality,
    paymentMethod: r.paymentMethod,
    totalAmount: r.totalAmount,
    customerName: r.firstName && r.lastName ? `${r.firstName} ${r.lastName}` : null,
  }));
}
