import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import type { PlanTier, SubscriptionStatus } from '@/core/domain/billing/plan-limits';
import { db } from '../connection';
import { HAS_PASSWORD } from '../repositories/drizzle-team-repository';
import { creditRateCaps, stores, storeSubscriptions, users } from '../schema';
import { withTenant } from '../with-tenant';

export type PlatformStoreItem = {
  id: string;
  name: string;
  taxIdType: string;
  taxId: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
};

/** stores no tiene RLS: el Administrador las lista con quina_app (D2). */
export async function listStores(search = ''): Promise<PlatformStoreItem[]> {
  const term = search.trim().replace(/[%_\\]/g, '');
  return db
    .select({
      id: stores.id,
      name: stores.commercialName,
      taxIdType: stores.taxIdType,
      taxId: stores.taxIdNumber,
      email: stores.contactEmail,
      isActive: stores.isActive,
      createdAt: stores.createdAt,
    })
    .from(stores)
    .where(
      term
        ? or(
            ilike(stores.commercialName, `%${term}%`),
            ilike(stores.taxIdNumber, `%${term}%`),
            ilike(stores.contactEmail, `%${term}%`),
          )
        : undefined,
    )
    .orderBy(desc(stores.createdAt))
    .limit(500);
}

export type PlatformStoreDetail = PlatformStoreItem & {
  businessTurn: string;
  ownerName: string;
  owner: { id: string; email: string; hasPassword: boolean } | null;
  planTier: PlanTier | null;
  status: SubscriptionStatus | null;
  trialEndsAt: Date | null;
};

export async function getStore(storeId: string): Promise<PlatformStoreDetail | null> {
  const [store] = await db
    .select({
      id: stores.id,
      name: stores.commercialName,
      taxIdType: stores.taxIdType,
      taxId: stores.taxIdNumber,
      email: stores.contactEmail,
      isActive: stores.isActive,
      createdAt: stores.createdAt,
      businessTurn: stores.businessTurn,
      ownerName: stores.ownerFullName,
    })
    .from(stores)
    .where(eq(stores.id, storeId));
  if (!store) return null;

  const [owner] = await db
    .select({ id: users.id, email: users.email, hasPassword: HAS_PASSWORD })
    .from(users)
    .where(and(eq(users.storeId, storeId), eq(users.role, 'STORE_OWNER')))
    .orderBy(asc(users.createdAt))
    .limit(1);
  // La suscripción tiene RLS: se lee con el contexto de esa tienda
  const [subscription] = await withTenant(storeId, (tx) =>
    tx
      .select({
        planTier: storeSubscriptions.planTier,
        status: storeSubscriptions.status,
        trialEndsAt: storeSubscriptions.trialEndsAt,
      })
      .from(storeSubscriptions)
      .where(eq(storeSubscriptions.storeId, storeId)),
  );
  return {
    ...store,
    owner: owner ?? null,
    planTier: (subscription?.planTier as PlanTier | undefined) ?? null,
    status: (subscription?.status as SubscriptionStatus | undefined) ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
  };
}

export type RateCapRow = {
  id: string;
  kind: string;
  currency: string;
  maxEffectiveAnnualRate: string;
  validFrom: string;
  validTo: string | null;
  source: string;
};

/** Historial de topes, la vigencia más reciente primero. */
export async function listRateCaps(): Promise<RateCapRow[]> {
  return db
    .select({
      id: creditRateCaps.id,
      kind: creditRateCaps.rateKind,
      currency: creditRateCaps.currency,
      maxEffectiveAnnualRate: creditRateCaps.maxEffectiveAnnualRate,
      validFrom: creditRateCaps.validFrom,
      validTo: creditRateCaps.validTo,
      source: creditRateCaps.sourceReference,
    })
    .from(creditRateCaps)
    .orderBy(
      asc(creditRateCaps.rateKind),
      asc(creditRateCaps.currency),
      desc(creditRateCaps.validFrom),
    );
}
