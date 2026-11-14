import { and, eq, gte, lte, notExists, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { ReportSummary } from '@/core/domain/analytics/report';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { creditChargeVoids, debtPayments, sales } from '../schema';
import { withTenant } from '../with-tenant';

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
