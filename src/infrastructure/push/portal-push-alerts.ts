import { eq } from 'drizzle-orm';
import { deliverPushBatch } from '@/core/application/notifications/dispatch-store-push';
import {
  buildPortalChargeResolutionPushPayload,
  buildPortalCreditSalePushPayload,
  buildPortalNoticePushPayload,
  type PortalPushNoticeKind,
} from '@/core/domain/notifications/push-messages';
import type { PushDeliverySummary, PushNotifier } from '@/core/domain/ports/push-notifier';
import type { Currency } from '@/core/domain/shared/money';
import { creditAccounts, customers, stores, users } from '../db/schema';
import { withTenant } from '../db/with-tenant';
import { DrizzlePushRepository } from './drizzle-push-repository';
import { createPushNotifier } from './push-gateway-factory';

const EMPTY_SUMMARY: PushDeliverySummary = { sent: 0, failed: 0, expired: 0 };

type PortalPushDeps = { notifier?: PushNotifier | null; repository?: DrizzlePushRepository };

async function resolveCustomerTarget(
  storeId: string,
  customerId: string,
  repo: DrizzlePushRepository,
) {
  const row = await withTenant(storeId, async (tx) => {
    const [store] = await tx
      .select({ name: stores.commercialName })
      .from(stores)
      .where(eq(stores.id, storeId));
    const [customer] = await tx
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, customerId));
    const [account] = await tx
      .select({ currency: creditAccounts.currency })
      .from(creditAccounts)
      .where(eq(creditAccounts.customerId, customerId));
    if (!store || !customer?.email) return null;

    const [portalUser] = await tx
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.email, customer.email.toLowerCase()));
    if (!portalUser?.isActive) return null;

    return {
      storeName: store.name,
      userId: portalUser.id,
      currency: (account?.currency ?? 'PEN') as Currency,
    };
  });

  if (!row) return null;
  const subscriptions = await repo.listForUser(storeId, row.userId);
  if (subscriptions.length === 0) return null;

  return { ...row, subscriptions };
}

/** Avisa al vecino al instante cuando la bodega le anota una compra al fiado. */
export async function notifyPortalCreditSale(
  storeId: string,
  customerId: string,
  sale: { saleId: string; total: string },
  deps: PortalPushDeps = {},
): Promise<PushDeliverySummary> {
  const notifier = deps.notifier !== undefined ? deps.notifier : createPushNotifier();
  if (!notifier) return EMPTY_SUMMARY;

  const repo = deps.repository ?? new DrizzlePushRepository();
  const target = await resolveCustomerTarget(storeId, customerId, repo);
  if (!target) return EMPTY_SUMMARY;

  return deliverPushBatch(
    repo,
    notifier,
    storeId,
    target.subscriptions,
    (sub) =>
      buildPortalCreditSalePushPayload(sub.locale, {
        storeName: target.storeName,
        storeId,
        saleId: sale.saleId,
        total: sale.total,
        currency: target.currency,
      }),
    { recordSentAt: false },
  );
}

/** Avisa al vecino cuando el comercio confirma o anula una compra observada. */
export async function notifyPortalChargeResolution(
  storeId: string,
  customerId: string,
  cycleId: string,
  outcome: 'confirmed' | 'voided',
  deps: PortalPushDeps = {},
): Promise<PushDeliverySummary> {
  const notifier = deps.notifier !== undefined ? deps.notifier : createPushNotifier();
  if (!notifier) return EMPTY_SUMMARY;

  const repo = deps.repository ?? new DrizzlePushRepository();
  const target = await resolveCustomerTarget(storeId, customerId, repo);
  if (!target) return EMPTY_SUMMARY;

  return deliverPushBatch(
    repo,
    notifier,
    storeId,
    target.subscriptions,
    (sub) =>
      buildPortalChargeResolutionPushPayload(sub.locale, {
        outcome,
        storeName: target.storeName,
        storeId,
        cycleId,
      }),
    { recordSentAt: false },
  );
}

/** Replica por push los avisos de cobranza y recibos entregados al vecino. */
export async function notifyPortalNotice(
  storeId: string,
  customerId: string,
  notice: {
    kind: PortalPushNoticeKind;
    total: string;
    currency: Currency;
    cycleId?: string;
    paymentId?: string;
    receiptNumber?: string;
  },
  deps: PortalPushDeps = {},
): Promise<PushDeliverySummary> {
  const notifier = deps.notifier !== undefined ? deps.notifier : createPushNotifier();
  if (!notifier) return EMPTY_SUMMARY;

  const repo = deps.repository ?? new DrizzlePushRepository();
  const target = await resolveCustomerTarget(storeId, customerId, repo);
  if (!target) return EMPTY_SUMMARY;

  return deliverPushBatch(
    repo,
    notifier,
    storeId,
    target.subscriptions,
    (sub) =>
      buildPortalNoticePushPayload(sub.locale, {
        kind: notice.kind,
        storeName: target.storeName,
        storeId,
        total: notice.total,
        currency: notice.currency,
        cycleId: notice.cycleId,
        paymentId: notice.paymentId,
        receiptNumber: notice.receiptNumber,
      }),
    { recordSentAt: false },
  );
}
