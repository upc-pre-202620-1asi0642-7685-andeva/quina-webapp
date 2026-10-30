const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const AccountLockoutPolicy = {
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,

  /** Bloqueada solo mientras `now` sea estrictamente menor que `lockedUntil`. */
  isLocked(state: { lockedUntil: Date | null }, now: Date): boolean {
    return state.lockedUntil !== null && now.getTime() < state.lockedUntil.getTime();
  },

  onFailure(
    state: { failedAttempts: number },
    now: Date,
  ): { failedAttempts: number; lockedUntil: Date | null; justLocked: boolean } {
    const failedAttempts = state.failedAttempts + 1;
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return {
        failedAttempts,
        lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
        justLocked: true,
      };
    }
    return { failedAttempts, lockedUntil: null, justLocked: false };
  },

  onSuccess(): { failedAttempts: 0; lockedUntil: null } {
    return { failedAttempts: 0, lockedUntil: null };
  },
};
