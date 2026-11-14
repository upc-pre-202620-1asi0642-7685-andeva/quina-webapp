'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { WifiOffIcon } from 'lucide-react';

/** Copia de páginas para leer sin señal; el mismo nombre está en public/sw.js. */
export const PAGES_CACHE = 'quina-pages';

/** US22: borra lo guardado para leer sin señal (al cerrar sesión, en celulares compartidos). */
export async function clearOfflinePages() {
  if ('caches' in window) await caches.delete(PAGES_CACHE);
}

/**
 * US22 crit. 1-3: registra el service worker. Solo en producción: en `next dev`
 * los archivos de `_next/static` cambian sin hash y la caché los dejaría viejos.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app' }).catch((error) => {
      console.error('[pwa] no se pudo registrar el service worker', error);
    });
  }, []);
  return null;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/** US22 crit. 4 y 5: sin señal se puede mirar, pero no vender ni cobrar. */
export function OfflineBanner() {
  const t = useTranslations('Offline');
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    // globals.css apaga los botones de enviar mientras no haya señal
    document.documentElement.toggleAttribute('data-offline', !online);
  }, [online]);

  if (online) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-card border border-amber/50 bg-amber/12 px-4 py-3 text-sm font-medium text-amber-ink print:hidden"
    >
      <WifiOffIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{t('banner')}</span>
    </div>
  );
}
