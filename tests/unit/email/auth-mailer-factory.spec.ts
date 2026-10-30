import { describe, expect, it } from 'vitest';
import { createAuthMailer, getAuthMailer } from '@/infrastructure/email/auth-mailer-factory';
import { OutboxAuthMailer } from '@/infrastructure/email/outbox-auth-mailer';
import { ResendAuthMailer } from '@/infrastructure/email/resend-auth-mailer';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('createAuthMailer', () => {
  it('defaults to outbox outside production', () => {
    expect(createAuthMailer(env({ NODE_ENV: 'development' }))).toBeInstanceOf(OutboxAuthMailer);
    expect(createAuthMailer(env({ NODE_ENV: 'test' }))).toBeInstanceOf(OutboxAuthMailer);
  });

  it('defaults to resend in production and requires the API key', () => {
    expect(() => createAuthMailer(env({ NODE_ENV: 'production' }))).toThrow(/RESEND_API_KEY/);
    expect(
      createAuthMailer(env({ NODE_ENV: 'production', RESEND_API_KEY: 're_x' })),
    ).toBeInstanceOf(ResendAuthMailer);
  });

  it('refuses outbox when VERCEL_ENV is production', () => {
    expect(() =>
      createAuthMailer(env({ EMAIL_TRANSPORT: 'outbox', VERCEL_ENV: 'production' })),
    ).toThrow(/outbox/);
  });

  it('rejects unknown transports', () => {
    expect(() => createAuthMailer(env({ EMAIL_TRANSPORT: 'smtp' }))).toThrow(/smtp/);
  });
});

describe('getAuthMailer', () => {
  it('picks outbox by default in test and memoizes', () => {
    const first = getAuthMailer();
    expect(first).toBeInstanceOf(OutboxAuthMailer);
    expect(getAuthMailer()).toBe(first);
  });
});
