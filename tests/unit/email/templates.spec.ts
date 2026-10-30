import { describe, expect, it } from 'vitest';
import { renderAuthEmail } from '@/infrastructure/email/templates';
import es from '../../../messages/es.json';
import qu from '../../../messages/qu.json';

describe('renderAuthEmail', () => {
  it('renders the OTP email in Spanish with the code and its expiry', () => {
    const mail = renderAuthEmail('verification-otp', 'es', { otp: '482913' });
    expect(mail.subject).toBe(es.Email.otp.subject);
    expect(mail.html).toContain('482913');
    expect(mail.text).toContain('482913');
    expect(mail.text).toContain('15 minutos');
  });

  it('uses the Quechua texts for the qu locale and includes the OTP', () => {
    const mail = renderAuthEmail('verification-otp', 'qu', { otp: '135790' });
    expect(mail.subject).toBe(qu.Email.otp.subject);
    expect(mail.subject).not.toBe(es.Email.otp.subject);
    expect(mail.html).toContain('135790');
    expect(mail.text).toContain(qu.Email.otp.intro);
  });

  it('renders the reset email with the link and the single-use notice', () => {
    const url = 'http://localhost:3000/app/reset-password?token=abc&x=1';
    const mail = renderAuthEmail('password-reset', 'en', { url });
    expect(mail.text).toContain(url);
    expect(mail.html).toContain('token=abc&amp;x=1');
    expect(mail.text).toContain('30 minutes');
  });

  it('renders the lockout alert with attempts, lock time and a reset suggestion', () => {
    const mail = renderAuthEmail('lockout-alert', 'es', {});
    expect(mail.text).toContain('5');
    expect(mail.text).toContain('15 minutos');
    expect(mail.text.toLowerCase()).toContain('contraseña');
  });

  it('escapes HTML in data', () => {
    const mail = renderAuthEmail('verification-otp', 'es', { otp: '<b>1</b>' });
    expect(mail.html).not.toContain('<b>1</b>');
  });

  it('requires the data each kind needs', () => {
    expect(() => renderAuthEmail('verification-otp', 'es', {})).toThrow();
    expect(() => renderAuthEmail('password-reset', 'es', {})).toThrow();
  });
});
