import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  notExists,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { CreditAccountStatus } from '@/core/domain/ports/credit-account-repository';
import { CASH_PAYMENT_METHODS, type CashPaymentMethod } from '@/core/domain/sales/cash-payment';
import type { CreditAccountSnapshot } from '@/core/domain/sales/credit-sale';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { termsFromRow } from '../repositories/drizzle-credit-account-repository';
import {
  creditAccounts,
  creditChargeVoids,
  customers,
  products,
  saleItems,
  sales,
  settlementCycles,
  units,
} from '../schema';
import { withTenant } from '../with-tenant';

export type CashBox = {
  total: string;
  count: number;
  byMethod: { method: CashPaymentMethod; total: string; count: number }[];
};

/** D6: caja de hoy, las ventas al contado del día de Lima sumadas por medio de pago. */
export async function loadTodayCashBox(storeId: string, now: Date): Promise<CashBox> {
  const today = BusinessDate.fromInstant(now);
  const rows = await withTenant(storeId, (tx) =>
    tx
      .select({
        method: sales.paymentMethod,
        // La suma sale de PostgreSQL como texto: nunca pasa por `number`
        total: sql<string>`sum(${sales.totalAmount})::numeric(12, 2)::text`,
        count: count(),
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          eq(sales.saleModality, 'CASH'),
          gte(sales.saleDate, BusinessDate.startInstant(today)),
          lte(sales.saleDate, BusinessDate.endInstant(today)),
        ),
      )
      .groupBy(sales.paymentMethod),
  );
  // Siempre en el mismo orden que el mostrador, aunque un medio no tenga ventas
  const byMethod = CASH_PAYMENT_METHODS.map((method) => {
    const row = rows.find((r) => r.method === method);
    return { method, total: row?.total ?? '0.00', count: row?.count ?? 0 };
  });
  return {
    total: Money.sum(
      byMethod.map((row) => Money.of(row.total, 'PEN')),
      'PEN',
    ).toFixed2(),
    count: byMethod.reduce((n, row) => n + row.count, 0),
    byMethod,
  };
}

export type CounterCustomer = {
  id: string;
  name: string;
  documentNumber: string;
  /** `null` si el vecino aún no tiene cuenta de fiado: solo se asocia al contado. */
  account: CreditAccountSnapshot | null;
};

const COUNTER_CUSTOMERS_LIMIT = 500;

/** Vecinos activos para el mostrador, con su cuenta de fiado tal como la valida la venta. */
export async function listCounterCustomers(storeId: string): Promise<CounterCustomer[]> {
  const rows = await withTenant(storeId, (tx) =>
    tx
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        documentNumber: customers.documentNumber,
        account: creditAccounts,
        // US08 crit. 8: el mostrador avisa antes de intentar el fiado
        hasOverdueCycle: sql<boolean>`exists (
          select 1 from ${settlementCycles}
          where ${settlementCycles.creditAccountId} = ${creditAccounts.id}
            and ${settlementCycles.status} = 'OVERDUE'
        )`,
      })
      .from(customers)
      .leftJoin(creditAccounts, eq(creditAccounts.customerId, customers.id))
      .where(and(eq(customers.storeId, storeId), eq(customers.isActive, true)))
      .orderBy(asc(customers.firstName), asc(customers.lastName))
      .limit(COUNTER_CUSTOMERS_LIMIT),
  );
  return rows.map((row) => ({
    id: row.id,
    name: `${row.firstName} ${row.lastName}`,
    documentNumber: row.documentNumber,
    account: row.account
      ? {
          id: row.account.id,
          customerActive: true,
          status: row.account.status as CreditAccountStatus,
          terms: termsFromRow(row.account),
          currentBalance: row.account.currentBalance,
          hasOverdueCycle: Boolean(row.hasOverdueCycle),
        }
      : null,
  }));
}

export type DailySales = { day: string; cash: string; credit: string };

/** Ventas de los últimos `days` días de Lima (hoy incluido), sin fiados anulados. */
export async function loadDailySales(storeId: string, now: Date, days = 7): Promise<DailySales[]> {
  const today = BusinessDate.fromInstant(now);
  const from = BusinessDate.addDays(today, -(days - 1));
  const day = sql<string>`to_char(${sales.saleDate} at time zone 'America/Lima', 'YYYY-MM-DD')`;
  const sum = (modality: SQL) =>
    sql<string>`coalesce(sum(${sales.totalAmount}) filter (where ${modality}), 0)::numeric(12, 2)::text`;
  const rows = await withTenant(storeId, (tx) =>
    tx
      .select({
        day,
        cash: sum(sql`${sales.saleModality} = 'CASH'`),
        credit: sum(sql`${sales.saleModality} <> 'CASH'`),
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, BusinessDate.startInstant(from)),
          lte(sales.saleDate, BusinessDate.endInstant(today)),
          // Un fiado anulado no fue una venta (Plan 4, P2), igual que en Reportes
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
  // Un día sin ventas también aparece, en cero
  return Array.from({ length: days }, (_, i) => {
    const iso = BusinessDate.toISO(BusinessDate.addDays(from, i));
    const row = rows.find((r) => r.day === iso);
    return { day: iso, cash: row?.cash ?? '0.00', credit: row?.credit ?? '0.00' };
  });
}

export type TodayCounterSaleItem = {
  productId: string;
  productName: string;
  unitCode: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
};

export type TodayCounterSale = {
  id: string;
  saleDate: Date;
  saleModality: 'CASH' | 'SINGLE_PAYMENT_CREDIT' | 'INSTALLMENTS_CREDIT';
  paymentMethod: CashPaymentMethod | 'CREDIT';
  totalAmount: string;
  amountReceived: string | null;
  changeGiven: string | null;
  customerId: string | null;
  customerName: string | null;
  items: TodayCounterSaleItem[];
};

export type TodayCounterSummary = {
  cashBox: CashBox;
  creditTotal: string;
  creditCount: number;
  sales: TodayCounterSale[];
};

/**
 * Resumen y bitácora del mostrador del día actual en Lima (ventas al contado y
 * al fiado vigentes, con sus líneas para consulta o repetición en el carrito).
 */
export async function loadTodayCounterSales(
  storeId: string,
  now: Date,
  limit = 15,
): Promise<TodayCounterSummary> {
  const today = BusinessDate.fromInstant(now);
  const start = BusinessDate.startInstant(today);
  const end = BusinessDate.endInstant(today);

  const [cashBox, creditSummary, saleRows] = await Promise.all([
    loadTodayCashBox(storeId, now),
    withTenant(storeId, async (tx) => {
      const [row] = await tx
        .select({
          total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)::numeric(12, 2)::text`,
          count: count(),
        })
        .from(sales)
        .where(
          and(
            eq(sales.storeId, storeId),
            sql`${sales.saleModality} <> 'CASH'`,
            gte(sales.saleDate, start),
            lte(sales.saleDate, end),
            notExists(
              tx
                .select({ id: creditChargeVoids.id })
                .from(creditChargeVoids)
                .where(eq(creditChargeVoids.saleId, sales.id)),
            ),
          ),
        );
      return { total: row?.total ?? '0.00', count: row?.count ?? 0 };
    }),
    withTenant(storeId, async (tx) => {
      const headers = await tx
        .select({
          id: sales.id,
          saleDate: sales.saleDate,
          saleModality: sales.saleModality,
          paymentMethod: sales.paymentMethod,
          totalAmount: sales.totalAmount,
          amountReceived: sales.amountReceived,
          changeGiven: sales.changeGiven,
          customerId: sales.customerId,
          firstName: customers.firstName,
          lastName: customers.lastName,
        })
        .from(sales)
        .leftJoin(customers, eq(customers.id, sales.customerId))
        .where(
          and(
            eq(sales.storeId, storeId),
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
        .orderBy(desc(sales.saleDate))
        .limit(limit);

      if (headers.length === 0) return [];
      const ids = headers.map((h) => h.id);
      const lines = await tx
        .select({
          saleId: saleItems.saleId,
          productId: saleItems.productId,
          productName: products.name,
          unitCode: units.code,
          quantity: saleItems.quantity,
          unitPrice: saleItems.unitPrice,
          subtotal: saleItems.subtotal,
        })
        .from(saleItems)
        .innerJoin(products, eq(products.id, saleItems.productId))
        .innerJoin(units, eq(units.id, products.unitId))
        .where(and(eq(saleItems.storeId, storeId), inArray(saleItems.saleId, ids)))
        .orderBy(asc(products.name));

      const bySale = new Map<string, TodayCounterSaleItem[]>();
      for (const line of lines) {
        const list = bySale.get(line.saleId) ?? [];
        list.push({
          productId: line.productId,
          productName: line.productName,
          unitCode: line.unitCode,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
        });
        bySale.set(line.saleId, list);
      }

      return headers.map((h) => ({
        id: h.id,
        saleDate: h.saleDate,
        saleModality: h.saleModality as TodayCounterSale['saleModality'],
        paymentMethod: h.paymentMethod as TodayCounterSale['paymentMethod'],
        totalAmount: h.totalAmount,
        amountReceived: h.amountReceived,
        changeGiven: h.changeGiven,
        customerId: h.customerId,
        customerName: h.firstName && h.lastName ? `${h.firstName} ${h.lastName}` : null,
        items: bySale.get(h.id) ?? [],
      }));
    }),
  ]);

  return {
    cashBox,
    creditTotal: creditSummary.total,
    creditCount: creditSummary.count,
    sales: saleRows,
  };
}
