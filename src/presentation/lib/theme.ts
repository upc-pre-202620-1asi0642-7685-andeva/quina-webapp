export const THEME_CHOICES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

const THEME_EVENT = 'quina-theme-change';

/** Lee la preferencia de tema guardada; si no hay o falla localStorage, sigue al sistema. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem('theme');
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Aplica el mismo contrato del <head> (`localStorage.theme` + `data-theme` en `<html>`). */
export function applyTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', choice);
  } catch {
    // Sin almacenamiento (modo privado): el cambio vale solo para esta visita
  }
  const resolved =
    choice === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : choice;
  document.documentElement.setAttribute('data-theme', resolved);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: choice }));
}

/** Escucha cambios de tema desde otros controles (menú del shell o página de preferencias). */
export function subscribeTheme(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === 'theme') onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', handleStorage);
  };
}
