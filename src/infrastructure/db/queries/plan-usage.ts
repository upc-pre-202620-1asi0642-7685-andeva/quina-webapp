import { and, count, eq, gte, lte } from 'drizzle-orm';
import { quotaPeriod } from '@/core/application/analytics/analyze-report';
import type { CountedResource } from '@/core/domain/billing/plan-limits';
import { DrizzleAIQuotaRepository } from '../repositories/drizzle-ai-quota-repository';
import { currentLimaMonthRange } from '../repositories/drizzle-purchase-repository';
import { creditAccounts, products, purchaseAttachments, users } from '../schema';
import { withTenant, type Tx } from '../with-tenant';

export async function queryPlanUsageInTx(
  tx: Tx,
  storeId: string,
): Promise<Record<CountedResource, number>> {
  const [accounts] = await tx
    .select({ total: count() })
    .from(creditAccounts)
    .where(and(eq(creditAccounts.storeId, storeId), eq(creditAccounts.status, 'ACTIVE')));
  // Igual que el límite de usuarios: dueño e invitados activos (D4)
  const [seats] = await tx
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.storeId, storeId), eq(users.isActive, true)));
  const [items] = await tx
    .select({ total: count() })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.isActive, true)));
  return {
    activeCreditCustomers: accounts?.total ?? 0,
    users: seats?.total ?? 0,
    products: items?.total ?? 0,
  };
}

/** Uso actual frente a los límites del plan (US26 crit. 4). */
export async function loadPlanUsage(storeId: string): Promise<Record<CountedResource, number>> {
  return withTenant(storeId, (tx) => queryPlanUsageInTx(tx, storeId));
}

/** Uso mensual de funciones con cuota (comprobantes de compra y consultas de IA) en Lima. */
export async function loadMonthlyFeatureUsage(
  storeId: string,
  now = new Date(),
): Promise<{ receiptsPerMonth: number; aiQueriesPerMonth: number }> {
  const { start, end } = currentLimaMonthRange(now);
  const [receiptsPerMonth, aiQueriesPerMonth] = await Promise.all([
    withTenant(storeId, async (tx) => {
      const [row] = await tx
        .select({ total: count() })
        .from(purchaseAttachments)
        .where(
          and(
            eq(purchaseAttachments.storeId, storeId),
            gte(purchaseAttachments.createdAt, start),
            lte(purchaseAttachments.createdAt, end),
          ),
        );
      return row?.total ?? 0;
    }),
    new DrizzleAIQuotaRepository().used(storeId, quotaPeriod(now)),
  ]);
  return { receiptsPerMonth, aiQueriesPerMonth };
}
