import { defaultTheme, themeChoices, type ThemeChoice } from '@/core/domain/shared/theme';
import { isThemeChoice } from './resolve-theme';

export const THEME_CHOICES = themeChoices;
export type { ThemeChoice };

const THEME_EVENT = 'quina-theme-change';

/** Lee la preferencia activa de tema desde `<html data-theme-choice>` (SSR / sesión). */
export function readThemeChoice(): ThemeChoice {
  if (typeof document === 'undefined') return defaultTheme;
  const attr = document.documentElement.getAttribute('data-theme-choice');
  return isThemeChoice(attr) ? attr : defaultTheme;
}

function resolveVisualTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'light' || choice === 'dark') return choice;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Aplica el tema elegido en el DOM sin tocar la cookie `quina-theme` del sitio. */
export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute('data-theme-choice', choice);
  document.documentElement.setAttribute('data-theme', resolveVisualTheme(choice));
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: choice }));
}

/** Escucha cambios de tema desde otros controles o del sistema cuando está en `system`. */
export function subscribeTheme(onChange: () => void): () => void {
  const media = matchMedia('(prefers-color-scheme: dark)');
  const handleMedia = () => {
    if (readThemeChoice() === 'system') {
      document.documentElement.setAttribute('data-theme', resolveVisualTheme('system'));
      onChange();
    }
  };
  window.addEventListener(THEME_EVENT, onChange);
  media.addEventListener('change', handleMedia);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener('change', handleMedia);
  };
}
