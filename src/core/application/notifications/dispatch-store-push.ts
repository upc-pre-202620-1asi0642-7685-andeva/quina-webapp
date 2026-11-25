import type {
  PushDeliverySummary,
  PushNotifier,
  PushPayload,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/core/domain/ports/push-notifier';

export type DeliverPushOptions = {
  now?: Date;
  deadline?: Date;
  recordSentAt?: boolean;
};

/**
 * Envía una notificación push a un conjunto de suscripciones de una tienda,
 * eliminando automáticamente las suscripciones vencidas (HTTP 404/410).
 */
export async function deliverPushBatch(
  repo: PushSubscriptionRepository,
  notifier: PushNotifier,
  storeId: string,
  subscriptions: readonly PushSubscriptionRecord[],
  payloadFor: (sub: PushSubscriptionRecord) => PushPayload | null,
  options: DeliverPushOptions = {},
): Promise<PushDeliverySummary> {
  const now = options.now ?? new Date();
  const recordSentAt = options.recordSentAt ?? true;
  const summary: PushDeliverySummary = { sent: 0, failed: 0, expired: 0 };

  if (subscriptions.length === 0) return summary;

  const sentIds: string[] = [];
  const expiredIds: string[] = [];

  for (const sub of subscriptions) {
    if (options.deadline && Date.now() > options.deadline.getTime()) break;

    const payload = payloadFor(sub);
    if (!payload) continue;

    const result = await notifier.send(sub, payload);
    if (result.status === 'SENT') {
      summary.sent += 1;
      sentIds.push(sub.id);
    } else if (result.status === 'EXPIRED') {
      summary.expired += 1;
      expiredIds.push(sub.id);
    } else {
      summary.failed += 1;
      if (result.errorMessage) {
        await repo.markError(storeId, sub.id, result.errorMessage).catch(() => {});
      }
    }
  }

  if (expiredIds.length > 0) {
    await repo.removeByIds(storeId, expiredIds).catch(() => {});
  }
  if (recordSentAt && sentIds.length > 0) {
    await repo.markSent(storeId, sentIds, now).catch(() => {});
  }

  return summary;
}
