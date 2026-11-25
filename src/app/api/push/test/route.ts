import { eq } from 'drizzle-orm';
import { deliverPushBatch } from '@/core/application/notifications/dispatch-store-push';
import { buildTestPushPayload } from '@/core/domain/notifications/push-messages';
import { stores } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { DrizzlePushRepository } from '@/infrastructure/push/drizzle-push-repository';
import { resolvePushActor } from '@/infrastructure/push/push-actor';
import { createPushNotifier } from '@/infrastructure/push/push-gateway-factory';

export async function POST() {
  const actor = await resolvePushActor();
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (actor.storeIds.length === 0) {
    return Response.json({ error: 'no_subscriptions' }, { status: 400 });
  }

  const notifier = createPushNotifier();
  if (!notifier) {
    return Response.json({ error: 'push_not_configured' }, { status: 503 });
  }

  const repo = new DrizzlePushRepository();
  const targetStoreId = actor.storeIds[0]!;
  const allSubs = (
    await Promise.all(actor.storeIds.map((storeId) => repo.listForUser(storeId, actor.user.id)))
  ).flat();

  // Un solo aviso de prueba por dispositivo aunque el vecino tenga varias tiendas
  const uniqueSubs = [...new Map(allSubs.map((sub) => [sub.endpoint, sub])).values()];
  if (uniqueSubs.length === 0) {
    return Response.json({ error: 'no_subscriptions' }, { status: 400 });
  }

  const [store] = await withTenant(targetStoreId, (tx) =>
    tx.select({ name: stores.commercialName }).from(stores).where(eq(stores.id, targetStoreId)),
  );
  const storeName =
    actor.kind === 'portal' && actor.storeIds.length > 1
      ? 'Portal del Vecino'
      : (store?.name ?? 'Quina');
  const testUrl = actor.kind === 'portal' ? '/app/portal/profile' : '/app/profile/preferences';

  const result = await deliverPushBatch(
    repo,
    notifier,
    uniqueSubs[0]!.storeId,
    uniqueSubs,
    (sub) => buildTestPushPayload(sub.locale, storeName, testUrl),
    { recordSentAt: false },
  );

  return Response.json({ ok: result.sent > 0, ...result });
}
