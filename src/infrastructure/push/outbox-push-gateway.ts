import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  PushNotifier,
  PushPayload,
  PushSendStatus,
  PushSubscriptionRecord,
} from '@/core/domain/ports/push-notifier';

export type OutboxPushMessage = {
  storeId: string;
  userId: string;
  endpoint: string;
  locale: PushSubscriptionRecord['locale'];
  payload: PushPayload;
  sentAt: string;
};

/** Guarda las notificaciones push como JSON en `.outbox/` para desarrollo y pruebas. */
export class OutboxPushGateway implements PushNotifier {
  constructor(private readonly dir: string = path.join(process.cwd(), '.outbox')) {}

  async send(
    subscription: PushSubscriptionRecord,
    payload: PushPayload,
  ): Promise<{ status: PushSendStatus; errorMessage?: string }> {
    const now = new Date();
    const record: OutboxPushMessage = {
      storeId: subscription.storeId,
      userId: subscription.userId,
      endpoint: subscription.endpoint,
      locale: subscription.locale,
      payload,
      sentAt: now.toISOString(),
    };
    await mkdir(this.dir, { recursive: true });
    const safeUser = subscription.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = `${now.getTime()}-${safeUser}-push.json`;
    await writeFile(path.join(this.dir, file), JSON.stringify(record, null, 2), 'utf8');
    return { status: 'SENT' };
  }
}
