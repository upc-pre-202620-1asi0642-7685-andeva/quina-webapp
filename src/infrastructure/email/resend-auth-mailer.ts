import { Resend } from 'resend';
import type { AuthMailKind, AuthMailer } from '@/core/domain/ports/auth-mailer';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import {
  renderAuthEmail,
  renderNotificationEmail,
  type EmailData,
  type RenderedEmail,
} from './templates';

type SendPayload = { from: string; to: string; subject: string; html: string; text: string };
type SendResult = { error?: { message: string; name?: string } | null };

/** Parte mínima del SDK de Resend que usamos (permite inyectar un doble en pruebas). */
export interface ResendLikeClient {
  emails: { send(payload: SendPayload): Promise<SendResult> };
}

export class ResendAuthMailer implements AuthMailer, NotificationMailer {
  private readonly client: ResendLikeClient;
  private readonly from: string;

  constructor(options: { apiKey: string; from: string; client?: ResendLikeClient }) {
    this.from = options.from;
    this.client = options.client ?? (new Resend(options.apiKey) as unknown as ResendLikeClient);
  }

  sendVerificationOtp(input: { to: string; otp: string; locale: Locale }): Promise<void> {
    return this.send(input.to, 'verification-otp', input.locale, { otp: input.otp });
  }

  sendPortalOtp(input: { to: string; otp: string; locale: Locale }): Promise<void> {
    return this.send(input.to, 'portal-otp', input.locale, { otp: input.otp });
  }

  sendPasswordReset(input: { to: string; url: string; locale: Locale }): Promise<void> {
    return this.send(input.to, 'password-reset', input.locale, { url: input.url });
  }

  sendLockoutAlert(input: { to: string; locale: Locale }): Promise<void> {
    return this.send(input.to, 'lockout-alert', input.locale, {});
  }

  sendCustomerWelcome(
    input: Parameters<NotificationMailer['sendCustomerWelcome']>[0],
  ): Promise<void> {
    const email = renderNotificationEmail('customer-welcome', input.locale, {
      url: input.privacyUrl,
      name: input.customerName,
      storeName: input.storeName,
    });
    return this.deliver(input.to, 'customer-welcome', email);
  }

  sendAccountSetup(input: Parameters<NotificationMailer['sendAccountSetup']>[0]): Promise<void> {
    return this.deliver(
      input.to,
      'account-setup',
      renderNotificationEmail('account-setup', input.locale, input),
    );
  }

  private send(to: string, kind: AuthMailKind, locale: Locale, data: EmailData): Promise<void> {
    return this.deliver(to, kind, renderAuthEmail(kind, locale, data));
  }

  private async deliver(to: string, kind: string, email: RenderedEmail): Promise<void> {
    const { subject, html, text } = email;
    const result = await this.client.emails.send({ from: this.from, to, subject, html, text });
    if (result.error) {
      throw new Error(`Resend failed to send ${kind} email: ${result.error.message}`);
    }
  }
}
