import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthMailKind, AuthMailer } from '@/core/domain/ports/auth-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import { renderAuthEmail, type EmailData } from './templates';

export type OutboxMail = {
  to: string;
  kind: AuthMailKind;
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

export class OutboxAuthMailer implements AuthMailer {
  private readonly dir: string;

  constructor(dir: string = path.join(process.cwd(), '.outbox')) {
    this.dir = dir;
  }

  sendVerificationOtp(input: { to: string; otp: string; locale: Locale }): Promise<void> {
    return this.write(input.to, 'verification-otp', input.locale, { otp: input.otp });
  }

  sendPasswordReset(input: { to: string; url: string; locale: Locale }): Promise<void> {
    return this.write(input.to, 'password-reset', input.locale, { url: input.url });
  }

  sendLockoutAlert(input: { to: string; locale: Locale }): Promise<void> {
    return this.write(input.to, 'lockout-alert', input.locale, {});
  }

  private async write(
    to: string,
    kind: AuthMailKind,
    locale: Locale,
    data: EmailData,
  ): Promise<void> {
    const { subject } = renderAuthEmail(kind, locale, data);
    const now = new Date();
    const mail: OutboxMail = { to, kind, ...data, locale, subject, sentAt: now.toISOString() };
    await mkdir(this.dir, { recursive: true });
    const file = `${now.getTime()}-${safeFileSegment(to)}-${kind}.json`;
    await writeFile(path.join(this.dir, file), JSON.stringify(mail, null, 2), 'utf8');
  }
}
