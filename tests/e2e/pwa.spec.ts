import { expect, test } from '@playwright/test';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('PWA instalable (US22)', () => {
  test('manifest válido con íconos, nombre corto y modo standalone', async ({ page, request }) => {
    // Crit. 1 y 3
    const response = await request.get('./manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      short_name: 'Quina',
      start_url: '/app',
      scope: '/app',
      display: 'standalone',
      theme_color: '#2bdd66',
    });
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
      '192x192',
      '512x512',
      '512x512',
    ]);
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await request.get(icon.src.replace(/^\/app\//, './'))).ok()).toBe(true);
    }

    await page.goto('./login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/app/manifest.webmanifest',
    );
    // El service worker en /app/sw.js puede controlar también /app
    const sw = await request.get('./sw.js');
    expect(sw.headers()['service-worker-allowed']).toBe('/app');
  });

  test('la página sin conexión es pública y accesible', async ({ page }) => {
    await page.goto('./offline');
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
    await expectAccessible(page);
  });

  test('sin señal deja leer lo ya abierto y borra la copia al cerrar sesión', async ({
    page,
    context,
  }) => {
    // El service worker solo se registra en producción (pnpm start, como en CI)
    test.skip(!process.env.CI, 'requiere el build de producción');
    test.setTimeout(120_000);
    await isolateRateLimitIp(page);
    await registerOwnerWithStore(page);

    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    // Crit. 6: lo precargado pesa menos de 5 MB
    const precached = await page.evaluate(async () => {
      let bytes = 0;
      for (const key of await caches.keys()) {
        if (!key.startsWith('quina-static-')) continue;
        const cache = await caches.open(key);
        for (const req of await cache.keys()) {
          bytes += (await (await cache.match(req))!.blob()).size;
        }
      }
      return bytes;
    });
    expect(precached).toBeLessThan(5 * 1024 * 1024);

    // Con señal se abren los vecinos: el service worker guarda la página
    await page.reload();
    await page.goto('./customers');
    await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => caches.has('quina-pages')), { timeout: 10_000 })
      .toBe(true);

    // Crit. 4: sin señal se leen los vecinos guardados y lo demás muestra el aviso
    await context.setOffline(true);
    await page.goto('./customers');
    await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
    await expect(page.getByText(/Sin conexión: puedes mirar/)).toBeVisible();
    await page.goto('./sales');
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();

    // Celular compartido: al cerrar sesión no queda nada guardado
    await context.setOffline(false);
    await page.goto('./profile');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/app\/login/);
    expect(await page.evaluate(() => caches.has('quina-pages'))).toBe(false);
  });
});
