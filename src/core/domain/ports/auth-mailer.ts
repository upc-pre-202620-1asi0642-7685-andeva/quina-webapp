import type { Locale } from '../shared/locale';

export type AuthMailKind = 'verification-otp' | 'portal-otp' | 'password-reset' | 'lockout-alert';

export interface AuthMailer {
  sendVerificationOtp(input: { to: string; otp: string; locale: Locale }): Promise<void>;
  /** Código para que el vecino entre a su portal (US14.4). */
  sendPortalOtp(input: { to: string; otp: string; locale: Locale }): Promise<void>;
  sendPasswordReset(input: { to: string; url: string; locale: Locale }): Promise<void>;
  sendLockoutAlert(input: { to: string; locale: Locale }): Promise<void>;
}
