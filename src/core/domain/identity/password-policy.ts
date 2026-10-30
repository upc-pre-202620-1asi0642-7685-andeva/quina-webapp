import { err, ok, type Result } from '@/core/domain/shared/result';

export type PasswordRule = 'MIN_LENGTH' | 'UPPERCASE' | 'NUMBER' | 'SYMBOL';

const MIN_LENGTH = 8;

export const PasswordPolicy = {
  /** Devuelve todas las reglas incumplidas, en orden fijo. */
  check(pw: string): Result<void, PasswordRule[]> {
    const missing: PasswordRule[] = [];
    if (pw.length < MIN_LENGTH) missing.push('MIN_LENGTH');
    if (!/\p{Lu}/u.test(pw)) missing.push('UPPERCASE');
    if (!/\d/.test(pw)) missing.push('NUMBER');
    if (!/[^\p{L}\d\s]/u.test(pw)) missing.push('SYMBOL');
    return missing.length === 0 ? ok(undefined) : err(missing);
  },
};
