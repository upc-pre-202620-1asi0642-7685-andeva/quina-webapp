import { and, eq, inArray } from 'drizzle-orm';
import { deliverPushBatch } from '@/core/application/notifications/dispatch-store-push';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { isRole, type Role } from '@/core/domain/identity/roles';
import {
  buildChargeObjectedPushPayload,
  buildDailyPushPayload,
} from '@/core/domain/notifications/push-messages';
import type {
  PushDeliverySummary,
  PushNotifier,
  PushSubscriptionRecord,
} from '@/core/domain/ports/push-notifier';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { countLowStockProducts } from '../db/queries/catalog';
import { listCollections } from '../db/queries/collections';
import { queryPlanUsageInTx } from '../db/queries/plan-usage';
import { selectSubscription } from '../db/repositories/drizzle-subscription-repository';
import { customers, stores, users } from '../db/schema';
import { withTenant } from '../db/with-tenant';
import { DrizzlePushRepository } from './drizzle-push-repository';
import { createPushNotifier } from './push-gateway-factory';

const DUE_SOON_DAYS = 3;

export async function dispatchDailyStorePush(
  storeId: string,
  now: Date,
  deadline: Date,
  deps: { notifier?: PushNotifier | null; repository?: DrizzlePushRepository } = {},
): Promise<PushDeliverySummary> {
  if (Date.now() > deadline.getTime()) return { sent: 0, failed: 0, expired: 0 };

  const notifier = deps.notifier !== undefined ? deps.notifier : createPushNotifier();
  if (!notifier) return { sent: 0, failed: 0, expired: 0 };

  const repo = deps.repository ?? new DrizzlePushRepository();
  const subscriptions = await repo.listForStore(storeId);
  if (subscriptions.length === 0) return { sent: 0, failed: 0, expired: 0 };

  const snapshot = await withTenant(storeId, async (tx) => {
    const [store] = await tx
      .select({ name: stores.commercialName })
      .from(stores)
      .where(eq(stores.id, storeId));
    const subscription = await selectSubscription(tx, storeId);
    const usage = await queryPlanUsageInTx(tx, storeId);
    const userIds = [...new Set(subscriptions.map((s) => s.userId))];
    const userRows =
      userIds.length > 0
        ? await tx
            .select({ id: users.id, role: users.role, isActive: users.isActive })
            .from(users)
            .where(and(eq(users.storeId, storeId), inArray(users.id, userIds)))
        : [];
    return { store, subscription, usage, userRows };
  });

  if (!snapshot.store || !snapshot.subscription) {
    return { sent: 0, failed: 0, expired: 0 };
  }

  const [collections, lowStockCount] = await Promise.all([
    listCollections(storeId),
    countLowStockProducts(storeId),
  ]);

  const overdueCount = collections.filter((row) => row.status === 'OVERDUE').length;
  const soonLimit = now.getTime() + DUE_SOON_DAYS * 86_400_000;
  const dueSoonCount = collections.filter(
    (row) => row.status === 'BILLED' && row.paymentDueDate.getTime() <= soonLimit,
  ).length;

  const tier = PlanLimits.effectiveTier(snapshot.subscription, now);
  const isReadOnly = PlanLimits.isReadOnly(tier, snapshot.usage);
  const trialDaysRemaining = PlanLimits.trialDaysRemaining(snapshot.subscription, now);
  const graceDaysRemaining = PlanLimits.graceDaysRemaining(snapshot.subscription, now);

  const roleByUser = new Map<string, Role>();
  for (const u of snapshot.userRows) {
    if (u.isActive && isRole(u.role)) roleByUser.set(u.id, u.role);
  }

  const activeSubs = subscriptions.filter((sub) => roleByUser.has(sub.userId));
  if (activeSubs.length === 0) return { sent: 0, failed: 0, expired: 0 };

  const todayIso = BusinessDate.toISO(BusinessDate.fromInstant(now));
  const pendingToday = activeSubs.filter(
    (sub) =>
      !sub.lastSentAt || BusinessDate.toISO(BusinessDate.fromInstant(sub.lastSentAt)) !== todayIso,
  );
  if (pendingToday.length === 0) return { sent: 0, failed: 0, expired: 0 };

  return deliverPushBatch(
    repo,
    notifier,
    storeId,
    pendingToday,
    (sub: PushSubscriptionRecord) => {
      const role = roleByUser.get(sub.userId);
      if (!role) return null;
      return buildDailyPushPayload(
        sub.locale,
        {
          storeName: snapshot.store!.name,
          overdueCount,
          dueSoonCount,
          lowStockCount,
          isReadOnly,
          graceDaysRemaining,
          trialDaysRemaining,
          canViewBilling: can(role, 'settings.billing'),
          canViewCollections: can(role, 'payments.create'),
          canViewStock: can(role, 'stock.read'),
        },
        todayIso,
      );
    },
    { now, deadline },
  );
}

/** Avisa al instante a los dispositivos de la tienda cuando un vecino observa un cargo. */
export async function notifyStoreChargeObjected(
  storeId: string,
  customerId: string,
  cycleId: string,
  deps: { notifier?: PushNotifier | null; repository?: DrizzlePushRepository } = {},
): Promise<PushDeliverySummary> {
  const notifier = deps.notifier !== undefined ? deps.notifier : createPushNotifier();
  if (!notifier) return { sent: 0, failed: 0, expired: 0 };

  const repo = deps.repository ?? new DrizzlePushRepository();
  const subscriptions = await repo.listForStore(storeId);
  if (subscriptions.length === 0) return { sent: 0, failed: 0, expired: 0 };

  const userIds = [...new Set(subscriptions.map((s) => s.userId))];
  const info = await withTenant(storeId, async (tx) => {
    const [store] = await tx
      .select({ name: stores.commercialName })
      .from(stores)
      .where(eq(stores.id, storeId));
    const [customer] = await tx
      .select({ firstName: customers.firstName })
      .from(customers)
      .where(eq(customers.id, customerId));
    // Solo personal activo de la tienda: las filas del vecino (`storeId = null`) no reciben avisos internos
    const staffRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.storeId, storeId), eq(users.isActive, true), inArray(users.id, userIds)));
    return {
      storeName: store?.name,
      customerName: customer?.firstName,
      staffIds: new Set(staffRows.map((u) => u.id)),
    };
  });

  if (!info.storeName || !info.customerName) {
    return { sent: 0, failed: 0, expired: 0 };
  }

  const staffSubscriptions = subscriptions.filter((sub) => info.staffIds.has(sub.userId));
  if (staffSubscriptions.length === 0) {
    return { sent: 0, failed: 0, expired: 0 };
  }

  return deliverPushBatch(
    repo,
    notifier,
    storeId,
    staffSubscriptions,
    (sub) =>
      buildChargeObjectedPushPayload(sub.locale, {
        customerName: info.customerName!,
        storeName: info.storeName!,
        customerId,
        cycleId,
      }),
    { recordSentAt: false },
  );
}
