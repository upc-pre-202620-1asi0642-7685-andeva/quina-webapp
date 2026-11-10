import { and, count, eq } from 'drizzle-orm';
import type { CountedResource } from '@/core/domain/billing/plan-limits';
import { creditAccounts, products, users } from '../schema';
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
