// Service worker de Quina (US22, Plan 8 D11). Se sirve en /app/sw.js con alcance /app.
// - Precarga solo la página sin conexión y los íconos (muy por debajo de 5 MB, crit. 6).
// - Las navegaciones van primero a la red. Solo el catálogo y los vecinos se guardan para
//   leerlos sin señal (crit. 4); el resto cae a la página sin conexión.
// - Nunca intercepta POST: vender y cobrar exigen red (crit. 5).
// - La copia de páginas se borra al cerrar sesión (perfil) y al llegar al login, que es
//   adonde lleva una sesión vencida.
const VERSION = 'v1';
const STATIC_CACHE = `quina-static-${VERSION}`;
const PAGES_CACHE = 'quina-pages';
const OFFLINE_URL = '/app/offline';
const PRECACHE = [OFFLINE_URL, '/app/brand/pwa-icon-192.png', '/app/brand/pwa-icon-512.png'];
const READABLE_OFFLINE = [/^\/app\/inventory(\/|$)/, /^\/app\/customers(\/|$)/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('quina-static-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isReadable = (url) => READABLE_OFFLINE.some((pattern) => pattern.test(url.pathname));

// La clave es la URL de la página, sin las cabeceras de Next (`ignoreVary` al leer)
const pageKey = (url) => new Request(`${url.origin}${url.pathname}${url.search}`);

async function navigate(request) {
  const url = new URL(request.url);
  // Llegar al login (sesión vencida o cerrada) borra lo guardado de la tienda
  if (url.pathname.startsWith('/app/login')) await caches.delete(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && isReadable(url)) {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(pageKey(url), response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(pageKey(url), { cacheName: PAGES_CACHE, ignoreVary: true });
    return (
      cached ?? (await caches.match(OFFLINE_URL, { cacheName: STATIC_CACHE })) ?? Response.error()
    );
  }
}

/**
 * Casi todo se navega dentro de Next (peticiones RSC), no con cargas completas. Al
 * abrir catálogo o vecinos con señal, se guarda también su HTML para leerlo sin señal.
 */
async function rememberPage(url) {
  url.searchParams.delete('_rsc');
  const response = await fetch(pageKey(url), { credentials: 'same-origin', redirect: 'manual' });
  if (response.ok && (response.headers.get('content-type') ?? '').includes('text/html')) {
    const cache = await caches.open(PAGES_CACHE);
    await cache.put(pageKey(url), response);
  }
}

// CSS, JS y fuentes con hash: no cambian, así la página guardada se ve bien sin señal.
// shortcut: los archivos de despliegues anteriores quedan hasta subir VERSION; si la caché
// crece demasiado, limpiar por antigüedad.
async function staticAsset(request) {
  const cached = await caches.match(request, { cacheName: STATIC_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/app')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
  } else if (
    request.headers.get('RSC') === '1' &&
    !request.headers.has('Next-Router-Prefetch') &&
    isReadable(url)
  ) {
    event.waitUntil(rememberPage(new URL(url)).catch(() => {}));
  } else if (url.pathname.startsWith('/app/_next/static/')) {
    event.respondWith(staticAsset(request));
  }
});
