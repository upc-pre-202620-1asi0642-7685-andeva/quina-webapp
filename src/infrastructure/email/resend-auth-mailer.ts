import { Resend } from 'resend';
import type { AuthMailKind, AuthMailer } from '@/core/domain/ports/auth-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import { renderAuthEmail, type EmailData } from './templates';

type SendPayload = { from: string; to: string; subject: string; html: string; text: string };
type SendResult = { error?: { message: string; name?: string } | null };

/** Parte mínima del SDK de Resend que usamos (permite inyectar un doble en pruebas). */
export interface ResendLikeClient {
  emails: { send(payload: SendPayload): Promise<SendResult> };
}

export class ResendAuthMailer implements AuthMailer {
  private readonly client: ResendLikeClient;
  private readonly from: string;

  constructor(options: { apiKey: string; from: string; client?: ResendLikeClient }) {
    this.from = options.from;
    this.client = options.client ?? (new Resend(options.apiKey) as unknown as ResendLikeClient);
  }

  sendVerificationOtp(input: { to: string; otp: string; locale: Locale }): Promise<void> {
    return this.send(input.to, 'verification-otp', input.locale, { otp: input.otp });
  }

  sendPasswordReset(input: { to: string; url: string; locale: Locale }): Promise<void> {
    return this.send(input.to, 'password-reset', input.locale, { url: input.url });
  }

  sendLockoutAlert(input: { to: string; locale: Locale }): Promise<void> {
    return this.send(input.to, 'lockout-alert', input.locale, {});
  }

  private async send(
    to: string,
    kind: AuthMailKind,
    locale: Locale,
    data: EmailData,
  ): Promise<void> {
    const { subject, html, text } = renderAuthEmail(kind, locale, data);
    const result = await this.client.emails.send({ from: this.from, to, subject, html, text });
    if (result.error) {
      throw new Error(`Resend failed to send ${kind} email: ${result.error.message}`);
    }
  }
}
