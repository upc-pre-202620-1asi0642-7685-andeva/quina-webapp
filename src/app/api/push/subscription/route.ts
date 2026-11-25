import { z } from 'zod';
import { DrizzlePushRepository } from '@/infrastructure/push/drizzle-push-repository';
import { getVapidPublicKey, isPushConfigured } from '@/infrastructure/push/push-gateway-factory';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';

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

async function requireStoreSession() {
  const user = await getSessionUser();
  if (
    !user?.storeId ||
    (user.role !== 'STORE_OWNER' && user.role !== 'STORE_EMPLOYEE') ||
    nextRouteFor(user, '/')
  ) {
    return null;
  }
  return { ...user, storeId: user.storeId };
}

export async function GET() {
  const user = await requireStoreSession();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const repo = new DrizzlePushRepository();
  const activeCount = await repo.countForUser(user.storeId, user.id);

  return Response.json(
    {
      configured: isPushConfigured(),
      vapidPublicKey: getVapidPublicKey(),
      activeCount,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const user = await requireStoreSession();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
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
  await repo.upsert({
    storeId: user.storeId,
    userId: user.id,
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: request.headers.get('user-agent'),
    locale: user.preferredLocale,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireStoreSession();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

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
  await repo.removeByEndpoint(user.storeId, user.id, parsed.data.endpoint);

  return Response.json({ ok: true });
}
