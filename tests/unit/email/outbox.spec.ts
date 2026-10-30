import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OutboxAuthMailer } from '@/infrastructure/email/outbox-auth-mailer';
import { readLatestMail } from '../../e2e/support/outbox';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'quina-outbox-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('OutboxAuthMailer', () => {
  it('writes the OTP mail as a JSON file with a Windows-safe name', async () => {
    const mailer = new OutboxAuthMailer(dir);
    await mailer.sendVerificationOtp({ to: 'ana+1@correo.pe', otp: '123456', locale: 'es' });

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d+-[a-zA-Z0-9._+-]+-verification-otp\.json$/);
    const mail = JSON.parse(await readFile(path.join(dir, files[0]!), 'utf8'));
    expect(mail).toMatchObject({
      to: 'ana+1@correo.pe',
      kind: 'verification-otp',
      otp: '123456',
      locale: 'es',
    });
    expect(mail.subject).toBeTruthy();
    expect(mail.sentAt).toBeTruthy();
  });

  it('writes reset and lockout mails', async () => {
    const mailer = new OutboxAuthMailer(dir);
    await mailer.sendPasswordReset({ to: 'a@b.pe', url: 'http://x/y', locale: 'en' });
    await mailer.sendLockoutAlert({ to: 'a@b.pe', locale: 'qu' });
    expect((await readLatestMail('a@b.pe', 'password-reset', { dir })).url).toBe('http://x/y');
    expect((await readLatestMail('a@b.pe', 'lockout-alert', { dir })).locale).toBe('qu');
  });
});

describe('readLatestMail', () => {
  it('returns the newest matching mail', async () => {
    const mailer = new OutboxAuthMailer(dir);
    await mailer.sendVerificationOtp({ to: 'a@b.pe', otp: '111111', locale: 'es' });
    await new Promise((r) => setTimeout(r, 5));
    await mailer.sendVerificationOtp({ to: 'a@b.pe', otp: '222222', locale: 'es' });
    await mailer.sendVerificationOtp({ to: 'otro@b.pe', otp: '333333', locale: 'es' });
    const mail = await readLatestMail('a@b.pe', 'verification-otp', { dir });
    expect(mail.otp).toBe('222222');
  });

  it('waits for a mail that arrives later', async () => {
    const mailer = new OutboxAuthMailer(dir);
    setTimeout(() => {
      void mailer.sendVerificationOtp({ to: 'late@b.pe', otp: '999999', locale: 'es' });
    }, 300);
    const mail = await readLatestMail('late@b.pe', 'verification-otp', { dir });
    expect(mail.otp).toBe('999999');
  });

  it('ignores corrupt files and throws a clear error on timeout', async () => {
    await writeFile(path.join(dir, '1-x.json'), '{ not json', 'utf8');
    await expect(
      readLatestMail('nobody@b.pe', 'verification-otp', { dir, timeoutMs: 300 }),
    ).rejects.toThrow(/nobody@b\.pe/);
  });
});
