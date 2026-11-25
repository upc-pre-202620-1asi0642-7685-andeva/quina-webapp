import { defaultTheme, themeChoices, type ThemeChoice } from '@/core/domain/shared/theme';

export { defaultTheme, themeChoices, type ThemeChoice };

/** Cookie de tema compartida con el sitio público (mismo origen). */
export const THEME_COOKIE = 'quina-theme';

export function isThemeChoice(value: string | null | undefined): value is ThemeChoice {
  return themeChoices.includes(value as ThemeChoice);
}

/**
 * Tema de la interfaz: si el usuario tiene sesión, manda su preferencia guardada
 * en `users.preferred_theme` (independiente del sitio); sin sesión usa la cookie
 * `quina-theme` del sitio y, si no existe, sigue el tema del sistema (`system`).
 */
export function resolveTheme(input: {
  userPreference?: string | null;
  cookie?: string | null;
}): ThemeChoice {
  if (isThemeChoice(input.userPreference)) return input.userPreference;
  if (input.cookie === 'light' || input.cookie === 'dark') return input.cookie;
  return defaultTheme;
}
