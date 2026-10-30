import { describe, expect, it, vi } from 'vitest';
import { ResendAuthMailer } from '@/infrastructure/email/resend-auth-mailer';

describe('ResendAuthMailer', () => {
  it('sends the rendered email through the client', async () => {
    const send = vi.fn().mockResolvedValue({ error: null });
    const mailer = new ResendAuthMailer({
      apiKey: 'k',
      from: 'Quina <hola@andeva.tech>',
      client: { emails: { send } },
    });
    await mailer.sendVerificationOtp({ to: 'a@b.pe', otp: '654321', locale: 'es' });
    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]![0];
    expect(payload).toMatchObject({ from: 'Quina <hola@andeva.tech>', to: 'a@b.pe' });
    expect(payload.html).toContain('654321');
    expect(payload.text).toContain('654321');
  });

  it('throws a clear error when Resend returns an error object', async () => {
    const send = vi.fn().mockResolvedValue({ error: { name: 'validation_error', message: 'bad' } });
    const mailer = new ResendAuthMailer({
      apiKey: 'k',
      from: 'x',
      client: { emails: { send } },
    });
    await expect(mailer.sendLockoutAlert({ to: 'a@b.pe', locale: 'es' })).rejects.toThrow(
      /lockout-alert.*bad/,
    );
  });
});
