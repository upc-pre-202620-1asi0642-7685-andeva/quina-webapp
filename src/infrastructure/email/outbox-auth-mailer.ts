import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthMailKind, AuthMailer } from '@/core/domain/ports/auth-mailer';
import type {
  NotificationMailer,
  NotificationMailKind,
} from '@/core/domain/ports/notification-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import { renderAuthEmail, renderNotificationEmail, type EmailData } from './templates';

export type OutboxMail = {
  to: string;
  kind: AuthMailKind | NotificationMailKind;
  otp?: string;
  url?: string;
  locale: Locale;
  subject: string;
  sentAt: string;
};

/** Deja solo caracteres válidos en nombres de archivo de Windows. */
export function safeFileSegment(value: string): string {
  return value.replace(/@/g, '_at_').replace(/[^a-zA-Z0-9._+-]/g, '_');
}

export class OutboxAuthMailer implements AuthMailer, NotificationMailer {
  private readonly dir: string;

  constructor(dir: string = path.join(process.cwd(), '.outbox')) {
    this.dir = dir;
  }

  sendVerificationOtp(input: { to: string; otp: string; locale: Locale }): Promise<void> {
    return this.write(input.to, 'verification-otp', input.locale, { otp: input.otp });
  }

  sendPortalOtp(input: { to: string; otp: string; locale: Locale }): Promise<void> {
    return this.write(input.to, 'portal-otp', input.locale, { otp: input.otp });
  }

  sendPasswordReset(input: { to: string; url: string; locale: Locale }): Promise<void> {
    return this.write(input.to, 'password-reset', input.locale, { url: input.url });
  }

  sendLockoutAlert(input: { to: string; locale: Locale }): Promise<void> {
    return this.write(input.to, 'lockout-alert', input.locale, {});
  }

  sendCustomerWelcome(
    input: Parameters<NotificationMailer['sendCustomerWelcome']>[0],
  ): Promise<void> {
    const { subject } = renderNotificationEmail('customer-welcome', input.locale, {
      url: input.privacyUrl,
      name: input.customerName,
      storeName: input.storeName,
    });
    return this.save(input.to, 'customer-welcome', input.locale, subject, {
      url: input.privacyUrl,
    });
  }

  sendAccountSetup(input: Parameters<NotificationMailer['sendAccountSetup']>[0]): Promise<void> {
    const { subject } = renderNotificationEmail('account-setup', input.locale, input);
    return this.save(input.to, 'account-setup', input.locale, subject, { url: input.url });
  }

  private write(to: string, kind: AuthMailKind, locale: Locale, data: EmailData): Promise<void> {
    const { subject } = renderAuthEmail(kind, locale, data);
    return this.save(to, kind, locale, subject, data);
  }

  private async save(
    to: string,
    kind: OutboxMail['kind'],
    locale: Locale,
    subject: string,
    data: EmailData,
  ): Promise<void> {
    const now = new Date();
    const mail: OutboxMail = { to, kind, ...data, locale, subject, sentAt: now.toISOString() };
    await mkdir(this.dir, { recursive: true });
    const file = `${now.getTime()}-${safeFileSegment(to)}-${kind}.json`;
    await writeFile(path.join(this.dir, file), JSON.stringify(mail, null, 2), 'utf8');
  }
}
