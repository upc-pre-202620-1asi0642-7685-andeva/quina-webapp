import { err, ok, type Result } from '@/core/domain/shared/result';

const PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 150;

export const EmailAddress = {
  /** Quita espacios y pasa a minúsculas: un correo es una sola cuenta. */
  parse(raw: string): Result<string, 'EMAIL_INVALID'> {
    const email = raw.trim().toLowerCase();
    if (!PATTERN.test(email) || email.length > MAX_LENGTH) return err('EMAIL_INVALID');
    return ok(email);
  },
};
