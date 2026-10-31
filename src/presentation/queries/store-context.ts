import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { PlanLimits, type PlanTier, type Subscription } from '@/core/domain/billing/plan-limits';
import { stores, storeSubscriptions } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';

export type StoreContext = {
  name: string;
  subscription: Subscription;
  /** Plan que rige hoy (la prueba vencida cuenta como Casero). */
  tier: PlanTier;
};

/** Datos de la tienda que necesitan el shell y las páginas; una consulta por petición. */
export const loadStoreContext = cache(async (storeId: string): Promise<StoreContext> => {
  const row = await withTenant(storeId, async (tx) => {
    const [found] = await tx
      .select({
        name: stores.commercialName,
        planTier: storeSubscriptions.planTier,
        status: storeSubscriptions.status,
        trialEndsAt: storeSubscriptions.trialEndsAt,
      })
      .from(stores)
      .innerJoin(storeSubscriptions, eq(storeSubscriptions.storeId, stores.id))
      .where(eq(stores.id, storeId));
    return found;
  });
  if (!row) throw new Error(`La tienda ${storeId} no tiene suscripción`);

  const subscription = {
    planTier: row.planTier,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
  } as Subscription;
  return { name: row.name, subscription, tier: PlanLimits.effectiveTier(subscription, new Date()) };
});
