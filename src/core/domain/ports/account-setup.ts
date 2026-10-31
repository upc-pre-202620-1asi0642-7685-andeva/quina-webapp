/** Enlaces de un solo uso para definir la contraseña (US01.2, US05; decisión 2). */
export interface AccountSetupTokens {
  /** Crea un enlace nuevo que vence en 72 horas y anula los anteriores del usuario. */
  issue(userId: string, now: Date): Promise<string>;
}

export const ACCOUNT_SETUP_TTL_HOURS = 72;
