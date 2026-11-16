'use client';

import 'sileo/styles.css';
import { useSyncExternalStore } from 'react';
import { Toaster } from 'sileo';

type Theme = 'light' | 'dark';

const readTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * Toasts de confirmación (DESIGN.md §7.3) con el tema de Quina: sigue el
 * atributo `data-theme` de <html> y pinta el fondo con el token de superficie.
 */
export function AppToaster() {
  const theme = useSyncExternalStore(subscribe, readTheme, (): Theme => 'light');

  return (
    <Toaster
      position="top-center"
      theme={theme}
      options={{
        fill: 'var(--color-surface)',
        duration: 4000,
        // Sileo capitaliza cada palabra y pinta blanco sobre oscuro: la paleta
        // por estado (--sileo-state-*) se mapea a tokens `-ink` en globals.css
        styles: {
          title: 'normal-case!',
          description: 'text-ink-soft! tabular-nums',
        },
      }}
    />
  );
}
