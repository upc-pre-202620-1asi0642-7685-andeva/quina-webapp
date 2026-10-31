import { expect, test } from '@playwright/test';
import { createPlatformAdmin } from '../../scripts/create-platform-admin';
import {
  acceptInvite,
  expectAccessible,
  isolateRateLimitIp,
  signIn,
  STRONG_PASSWORD,
  uniqueEmail,
  uniqueRuc,
} from './support/flows';

const APP_DB =
  process.env.DATABASE_URL ?? 'postgres://quina_app:quina_app_test@localhost:54329/quina_test';

test.describe('plataforma (US01)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el Administrador crea una tienda, su dueño entra y al suspenderla queda fuera', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const adminEmail = uniqueEmail('admin');
    const link = await createPlatformAdmin({
      url: APP_DB,
      appUrl: 'http://localhost:3100/app',
      email: adminEmail,
      name: 'Admin Quina',
    });
    await page.goto(link.replace(/^.*\/app\//, './'));
    await page.getByLabel('Contraseña', { exact: true }).fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Crear mi contraseña' }).click();
    await expect(page.getByText('Listo. Ya puedes ingresar')).toBeVisible();

    await signIn(page, adminEmail);
    await expect(page).toHaveURL(/\/app\/platform\/stores/);
    await expectAccessible(page);

    await page.getByRole('link', { name: 'Crear tienda' }).click();
    const ownerEmail = uniqueEmail('dueno');
    const ruc = uniqueRuc();
    await page.getByLabel('Nombre comercial').fill('Bodega Don Pepe');
    await page.getByLabel('RUC o DNI').fill(ruc);
    await page.getByLabel('Nombre del dueño').fill('José Huamán');
    await page.getByLabel('Correo del dueño').fill(ownerEmail);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Crear tienda' }).click();
    await expect(
      page.getByText(`Tienda creada. Enviamos el enlace a ${ownerEmail}.`),
    ).toBeVisible();
    await expect(page.getByText('Casero', { exact: true })).toBeVisible();
    const storeUrl = page.url();

    // El Administrador la encuentra por su RUC entre todas las tiendas
    await page.goto('./platform/stores');
    await page.getByRole('searchbox', { name: 'Buscar tienda' }).fill(ruc);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('1 tienda', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Bodega Don Pepe/ })).toBeVisible();

    // El dueño define su contraseña y entra, en otra sesión
    const ownerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    await isolateRateLimitIp(owner);
    await acceptInvite(owner, ownerEmail);
    await signIn(owner, ownerEmail);
    await expect(owner).toHaveURL(/\/app\/?$/);

    // US01.5: al suspender, el dueño pierde la sesión
    await page.goto(storeUrl);
    await page.getByRole('button', { name: 'Suspender tienda' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Suspender' }).click();
    await expect(page.getByText('Tienda suspendida.')).toBeVisible();

    await owner.goto('./customers');
    await expect(owner).toHaveURL(/\/app\/login/);
    await ownerContext.close();
  });

  test('el Administrador ve los topes vigentes del BCRP', async ({ page, browser }) => {
    const adminEmail = uniqueEmail('admin');
    const link = await createPlatformAdmin({
      url: APP_DB,
      appUrl: 'http://localhost:3100/app',
      email: adminEmail,
      name: 'Admin Quina',
    });
    await page.goto(link.replace(/^.*\/app\//, './'));
    await page.getByLabel('Contraseña', { exact: true }).fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Crear mi contraseña' }).click();
    await expect(page.getByText('Listo. Ya puedes ingresar')).toBeVisible();
    await signIn(page, adminEmail);
    await expect(page).toHaveURL(/\/app\/platform\/stores/);
    await page.goto('./platform/rate-caps');
    await expect(page.getByText('114.13 % efectivo anual')).toBeVisible();
    await expectAccessible(page);

    // Sin JavaScript el formulario igual funciona y la redirección queda dentro de /app
    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
    const plain = await noJs.newPage();
    await plain.goto('./platform/stores/new');
    await plain.getByLabel('Nombre comercial').fill('Bodega Sin JS');
    await plain.getByLabel('RUC o DNI').fill(uniqueRuc());
    await plain.getByLabel('Nombre del dueño').fill('Luisa Paredes');
    await plain.getByLabel('Correo del dueño').fill(uniqueEmail('sinjs'));
    await plain.getByRole('button', { name: 'Crear tienda' }).click();
    await expect(plain).toHaveURL(/\/app\/platform\/stores\/[0-9a-f-]{36}\?notice=created/);
    await expect(plain.getByRole('heading', { name: 'Bodega Sin JS' })).toBeVisible();
    await noJs.close();
  });
});
