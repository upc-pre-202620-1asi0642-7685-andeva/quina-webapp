import type { PushNotifier } from '@/core/domain/ports/push-notifier';
import { OutboxPushGateway } from './outbox-push-gateway';
import { WebPushGateway } from './web-push-gateway';

const DEFAULT_SUBJECT = 'mailto:hola@andeva.tech';

export type PushTransport = 'webpush' | 'outbox';

export function resolvePushTransport(env: NodeJS.ProcessEnv = process.env): PushTransport {
  const explicit = env.PUSH_TRANSPORT;
  if (explicit === 'outbox') {
    if (env.VERCEL_ENV === 'production') {
      throw new Error('PUSH_TRANSPORT=outbox is not allowed when VERCEL_ENV=production');
    }
    return 'outbox';
  }
  if (explicit === 'webpush') return 'webpush';
  return env.NODE_ENV === 'production' || (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
    ? 'webpush'
    : 'outbox';
}

export function getVapidPublicKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.VAPID_PUBLIC_KEY?.trim();
  return key ? key : null;
}

export function isPushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const transport = resolvePushTransport(env);
  if (transport === 'outbox') return true;
  return Boolean(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim());
}

/** Devuelve `null` si en producción faltan las llaves VAPID (para no bloquear el cron). */
export function createPushNotifier(env: NodeJS.ProcessEnv = process.env): PushNotifier | null {
  const transport = resolvePushTransport(env);
  if (transport === 'outbox') {
    return new OutboxPushGateway();
  }
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;

  return new WebPushGateway({
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT,
  });
}
