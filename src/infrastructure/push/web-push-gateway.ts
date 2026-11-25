import { sendNotification } from 'web-push';
import type {
  PushNotifier,
  PushPayload,
  PushSendStatus,
  PushSubscriptionRecord,
} from '@/core/domain/ports/push-notifier';

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/** Envía notificaciones Web Push firmadas con VAPID (W3C Push API, sin intermediarios). */
export class WebPushGateway implements PushNotifier {
  constructor(private readonly config: VapidConfig) {}

  async send(
    subscription: PushSubscriptionRecord,
    payload: PushPayload,
  ): Promise<{ status: PushSendStatus; errorMessage?: string }> {
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: this.config.subject,
            publicKey: this.config.publicKey,
            privateKey: this.config.privateKey,
          },
          TTL: 86_400,
        },
      );
      return { status: 'SENT' };
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;
      const message = error instanceof Error ? error.message : String(error);
      // 404 y 410 significan que el navegador revocó o venció esta suscripción
      if (statusCode === 404 || statusCode === 410) {
        return { status: 'EXPIRED', errorMessage: message };
      }
      return { status: 'FAILED', errorMessage: message };
    }
  }
}
