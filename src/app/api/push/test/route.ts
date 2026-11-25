import { eq } from 'drizzle-orm';
import { deliverPushBatch } from '@/core/application/notifications/dispatch-store-push';
import { buildTestPushPayload } from '@/core/domain/notifications/push-messages';
import { stores } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { DrizzlePushRepository } from '@/infrastructure/push/drizzle-push-repository';
import { createPushNotifier } from '@/infrastructure/push/push-gateway-factory';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';

export async function POST() {
  const user = await getSessionUser();
  if (
    !user?.storeId ||
    (user.role !== 'STORE_OWNER' && user.role !== 'STORE_EMPLOYEE') ||
    nextRouteFor(user, '/')
  ) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const notifier = createPushNotifier();
  if (!notifier) {
    return Response.json({ error: 'push_not_configured' }, { status: 503 });
  }

  const repo = new DrizzlePushRepository();
  const subscriptions = await repo.listForUser(user.storeId, user.id);
  if (subscriptions.length === 0) {
    return Response.json({ error: 'no_subscriptions' }, { status: 400 });
  }

  const [store] = await withTenant(user.storeId, (tx) =>
    tx.select({ name: stores.commercialName }).from(stores).where(eq(stores.id, user.storeId!)),
  );
  const storeName = store?.name ?? 'Quina';

  const result = await deliverPushBatch(
    repo,
    notifier,
    user.storeId,
    subscriptions,
    (sub) => buildTestPushPayload(sub.locale, storeName),
    { recordSentAt: false },
  );

  return Response.json({ ok: result.sent > 0, ...result });
}
