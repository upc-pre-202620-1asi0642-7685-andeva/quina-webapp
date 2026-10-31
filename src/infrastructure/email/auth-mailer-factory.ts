import type { AuthMailer } from '@/core/domain/ports/auth-mailer';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import { LoggedNotificationMailer } from './logged-notification-mailer';
import { OutboxAuthMailer } from './outbox-auth-mailer';
import { ResendAuthMailer } from './resend-auth-mailer';

const DEFAULT_FROM = 'Quina <hola@andeva.tech>';

/** Cada transporte envía los correos de acceso y los avisos de la tienda. */
export type Mailer = AuthMailer & NotificationMailer;

let cached: Mailer | undefined;
let notifications: NotificationMailer | undefined;

export function createAuthMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const transport = env.EMAIL_TRANSPORT || (env.NODE_ENV === 'production' ? 'resend' : 'outbox');

  if (transport === 'outbox') {
    if (env.VERCEL_ENV === 'production') {
      throw new Error('EMAIL_TRANSPORT=outbox is not allowed when VERCEL_ENV=production');
    }
    return new OutboxAuthMailer();
  }
  if (transport === 'resend') {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required for EMAIL_TRANSPORT=resend');
    }
    return new ResendAuthMailer({
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM || DEFAULT_FROM,
    });
  }
  throw new Error(`Unknown EMAIL_TRANSPORT: ${transport}`);
}

export function getAuthMailer(): Mailer {
  cached ??= createAuthMailer();
  return cached;
}

/** Avisos de la tienda: cada envío queda en `notification_logs`, también si falla. */
export function getNotificationMailer(): NotificationMailer {
  notifications ??= new LoggedNotificationMailer(getAuthMailer());
  return notifications;
}
