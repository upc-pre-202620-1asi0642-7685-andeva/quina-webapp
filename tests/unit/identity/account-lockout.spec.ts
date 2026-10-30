import { describe, expect, it } from 'vitest';
import { AccountLockoutPolicy } from '@/core/domain/identity/account-lockout';

const now = new Date('2026-10-30T12:00:00.000Z');

describe('AccountLockoutPolicy', () => {
  it('no bloquea en el 4.º fallo', () => {
    expect(AccountLockoutPolicy.onFailure({ failedAttempts: 3 }, now)).toEqual({
      failedAttempts: 4,
      lockedUntil: null,
      justLocked: false,
    });
  });

  it('bloquea 15 minutos en el 5.º fallo', () => {
    expect(AccountLockoutPolicy.onFailure({ failedAttempts: 4 }, now)).toEqual({
      failedAttempts: 5,
      lockedUntil: new Date('2026-10-30T12:15:00.000Z'),
      justLocked: true,
    });
  });

  it('isLocked es estricto: a lockedUntil exacto ya no está bloqueada', () => {
    const lockedUntil = new Date('2026-10-30T12:15:00.000Z');
    expect(AccountLockoutPolicy.isLocked({ lockedUntil }, lockedUntil)).toBe(false);
    expect(
      AccountLockoutPolicy.isLocked({ lockedUntil }, new Date(lockedUntil.getTime() - 1)),
    ).toBe(true);
  });

  it('sin lockedUntil no está bloqueada', () => {
    expect(AccountLockoutPolicy.isLocked({ lockedUntil: null }, now)).toBe(false);
  });

  it('un login correcto reinicia el contador', () => {
    expect(AccountLockoutPolicy.onSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});
