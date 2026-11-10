import { cache } from 'react';
import { eq } from 'drizzle-orm';
import {
  PlanLimits,
  type CountedResource,
  type PlanTier,
  type Subscription,
} from '@/core/domain/billing/plan-limits';
import { queryPlanUsageInTx } from '@/infrastructure/db/queries/plan-usage';
import { selectSubscription } from '@/infrastructure/db/repositories/drizzle-subscription-repository';
import { stores } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { isLocale } from '@/presentation/i18n/resolve-locale';
import type { Locale } from '@/core/domain/shared/locale';

export type StoreContext = {
  name: string;
  /** Idioma de los correos a vecinos sin idioma propio (US27 crit. 4). */
  defaultLocale: Locale;
  subscription: Subscription;
  /** Plan que rige hoy (la prueba vencida cuenta como Casero). */
  tier: PlanTier;
  usage: Record<CountedResource, number>;
  overLimitResources: CountedResource[];
  /** US26 crit. 7 / D1: bloqueo de solo lectura cuando el uso supera el plan vigente tras vencer prueba o gracia. */
  isReadOnly: boolean;
  trialDaysRemaining: number | null;
  graceDaysRemaining: number | null;
};

/** Datos de la tienda que necesitan el shell y las páginas; una consulta por petición. */
export const loadStoreContext = cache(async (storeId: string): Promise<StoreContext> => {
  const data = await withTenant(storeId, async (tx) => {
    const [found] = await tx
      .select({
        name: stores.commercialName,
        defaultLocale: stores.defaultLocale,
      })
      .from(stores)
      .where(eq(stores.id, storeId));
    if (!found) return null;
    const subscription = await selectSubscription(tx, storeId);
    if (!subscription) return null;
    const usage = await queryPlanUsageInTx(tx, storeId);
    return { found, subscription, usage };
  });
  if (!data) throw new Error(`La tienda ${storeId} no tiene suscripción`);

  const now = new Date();
  const { found, subscription, usage } = data;
  const tier = PlanLimits.effectiveTier(subscription, now);
  return {
    name: found.name,
    defaultLocale: isLocale(found.defaultLocale) ? found.defaultLocale : 'es',
    subscription,
    tier,
    usage,
    overLimitResources: PlanLimits.overLimitResources(tier, usage),
    isReadOnly: PlanLimits.isReadOnly(tier, usage),
    trialDaysRemaining: PlanLimits.trialDaysRemaining(subscription, now),
    graceDaysRemaining: PlanLimits.graceDaysRemaining(subscription, now),
  };
});
