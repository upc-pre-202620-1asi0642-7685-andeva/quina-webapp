import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readLatestMail } from './support/outbox';

const STRONG_PASSWORD = 'Bodega#2026x';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function uniqueRuc(): string {
  const nineDigits = String(Math.floor(Math.random() * 900_000_000) + 100_000_000);
  return `20${nineDigits}`;
}

function randomIp(): string {
  const b = () => Math.floor(Math.random() * 250) + 1;
  return `198.51.${b()}.${b()}`;
}

async function isolateRateLimitIp(page: Page) {
  await page.route('**/api/auth/**', async (route) => {
    const headers = { ...route.request().headers(), 'x-forwarded-for': randomIp() };
    await route.continue({ headers });
  });
}

async function registerOwnerWithStore(page: Page) {
  const email = uniqueEmail('owner');
  const ruc = uniqueRuc();
  const storeName = `Bodega ${ruc.slice(-4)}`;

  await page.goto('./register');
  await page.getByLabel('Tu nombre completo').fill('Carmen Rojas');
  await page.getByLabel('Tu correo electrónico').fill(email);
  await page.getByLabel('Crea una contraseña segura').fill(STRONG_PASSWORD);
  await page.getByRole('checkbox', { name: /Acepto los Términos/ }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/register\/verify/);

  const { otp } = await readLatestMail(email, 'verification-otp');
  await page.getByLabel('Dígito 1 de 6').fill(otp!);
  await page.getByRole('button', { name: 'Confirmar código' }).click();
  await expect(page).toHaveURL(/\/app\/register\/store/);

  await page.getByLabel('Nombre comercial').fill(storeName);
  await page.getByLabel('RUC o DNI del negocio').fill(ruc);
  await page.getByRole('button', { name: 'Crear mi tienda' }).click();
  await expect(page).toHaveURL(/\/app\/?$/);

  return { email, storeName };
}

test.describe('perfil, selector de idioma y cierre de sesión (US02, US27)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('cambia el idioma a inglés actualizando la interfaz y la cookie, y tras cerrar sesión el botón atrás no muestra el panel', async ({
    page,
  }) => {
    const { storeName } = await registerOwnerWithStore(page);

    await page.getByRole('link', { name: 'Mi perfil e idioma' }).click();
    await expect(page).toHaveURL(/\/app\/profile/);

    // Cambiar idioma a inglés (en)
    await page.getByLabel('Idioma de la interfaz y correos').selectOption('en');
    await page.getByRole('button', { name: 'Guardar idioma' }).click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'quina-lang')?.value).toBe('en');

    // Cerrar sesión y verificar que volver atrás no muestra el panel
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/app\/login/);

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/login/);
    await expect(page.getByRole('heading', { name: storeName })).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`accesibilidad WCAG 2.1 AA en panel y perfil (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await registerOwnerWithStore(page);

      const dashResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(dashResults.violations).toEqual([]);

      await page.goto('./profile');
      const profileResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(profileResults.violations).toEqual([]);
    });
  }
});
