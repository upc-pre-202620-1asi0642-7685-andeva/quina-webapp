import { z } from 'zod';
import { DrizzlePushRepository } from '@/infrastructure/push/drizzle-push-repository';
import { resolvePushActor } from '@/infrastructure/push/push-actor';
import { getVapidPublicKey, isPushConfigured } from '@/infrastructure/push/push-gateway-factory';

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine((value) => value.startsWith('https://'), 'Endpoint must use HTTPS'),
  keys: z.object({
    p256dh: z.string().min(10).max(512),
    auth: z.string().min(8).max(256),
  }),
});

const deleteSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function GET() {
  const actor = await resolvePushActor();
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const noStores = actor.kind === 'portal' && actor.storeIds.length === 0;
  let activeCount = 0;

  if (!noStores) {
    const repo = new DrizzlePushRepository();
    if (actor.kind === 'store') {
      activeCount = await repo.countForUser(actor.storeIds[0], actor.user.id);
    } else {
      const lists = await Promise.all(
        actor.storeIds.map((storeId) => repo.listForUser(storeId, actor.user.id)),
      );
      activeCount = new Set(lists.flat().map((sub) => sub.endpoint)).size;
    }
  }

  return Response.json(
    {
      configured: isPushConfigured(),
      vapidPublicKey: getVapidPublicKey(),
      activeCount,
      noStores,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const actor = await resolvePushActor();
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (actor.storeIds.length === 0) {
    return Response.json({ error: 'no_stores' }, { status: 400 });
  }
  if (!isPushConfigured()) {
    return Response.json({ error: 'push_not_configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_subscription' }, { status: 400 });
  }

  const repo = new DrizzlePushRepository();
  const userAgent = request.headers.get('user-agent');
  await Promise.all(
    actor.storeIds.map((storeId) =>
      repo.upsert({
        storeId,
        userId: actor.user.id,
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,
        userAgent,
        locale: actor.user.preferredLocale,
      }),
    ),
  );

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const actor = await resolvePushActor();
  if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_endpoint' }, { status: 400 });
  }

  const repo = new DrizzlePushRepository();
  await Promise.all(
    actor.storeIds.map((storeId) =>
      repo.removeByEndpoint(storeId, actor.user.id, parsed.data.endpoint),
    ),
  );

  return Response.json({ ok: true });
}
