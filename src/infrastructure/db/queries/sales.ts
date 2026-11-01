import { and, asc, count, eq, gte, lte, sql } from 'drizzle-orm';
import type { CreditAccountStatus } from '@/core/domain/ports/credit-account-repository';
import { CASH_PAYMENT_METHODS, type CashPaymentMethod } from '@/core/domain/sales/cash-payment';
import type { CreditAccountSnapshot } from '@/core/domain/sales/credit-sale';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { termsFromRow } from '../repositories/drizzle-credit-account-repository';
import { creditAccounts, customers, sales, settlementCycles } from '../schema';
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
