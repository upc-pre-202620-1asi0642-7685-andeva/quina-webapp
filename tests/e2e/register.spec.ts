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

async function assertNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('registro autoservicio del comerciante (US24)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('completa el alta con OTP y crea la tienda con Prueba Pro en menos de 2 minutos', async ({
    page,
  }) => {
    const startedAt = Date.now();
    const email = uniqueEmail('alta');
    const ruc = uniqueRuc();
    const storeName = `Bodega ${ruc.slice(-4)}`;

    await page.goto('./register');
    await page.getByLabel('Tu nombre completo').fill('Lucho Quispe');
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
    await expect(page.getByRole('heading', { level: 1, name: storeName })).toBeVisible();
    await expect(page.getByText('Prueba Pro: 14 días')).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(120_000);
  });

  test('rechaza un correo ya registrado y un RUC ya usado con mensajes claros', async ({
    page,
  }) => {
    const email = uniqueEmail('dup');
    const ruc = uniqueRuc();

    // Primer comerciante completa su tienda
    await page.goto('./register');
    await page.getByLabel('Tu nombre completo').fill('Rosa Quispe');
    await page.getByLabel('Tu correo electrónico').fill(email);
    await page.getByLabel('Crea una contraseña segura').fill(STRONG_PASSWORD);
    await page.getByRole('checkbox', { name: /Acepto los Términos/ }).check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/register\/verify/);
    const firstOtp = await readLatestMail(email, 'verification-otp');
    await page.getByLabel('Dígito 1 de 6').fill(firstOtp.otp!);
    await page.getByRole('button', { name: 'Confirmar código' }).click();
    await expect(page).toHaveURL(/\/app\/register\/store/);
    await page.getByLabel('Nombre comercial').fill('Bodega Rosa');
    await page.getByLabel('RUC o DNI del negocio').fill(ruc);
    await page.getByRole('button', { name: 'Crear mi tienda' }).click();
    await expect(page).toHaveURL(/\/app\/?$/);

    // Limpiar sesión para probar un segundo registro
    await page.context().clearCookies();

    // Correo repetido
    await page.goto('./register');
    await page.getByLabel('Tu nombre completo').fill('Otro Dueño');
    await page.getByLabel('Tu correo electrónico').fill(email);
    await page.getByLabel('Crea una contraseña segura').fill(STRONG_PASSWORD);
    await page.getByRole('checkbox', { name: /Acepto los Términos/ }).check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByText('Ese correo ya tiene cuenta. Ingresa.')).toBeVisible();

    // RUC repetido con un correo nuevo
    const secondEmail = uniqueEmail('dup-ruc');
    await page.getByLabel('Tu correo electrónico').fill(secondEmail);
    await page.getByRole('checkbox', { name: /Acepto los Términos/ }).check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/register\/verify/);
    const secondOtp = await readLatestMail(secondEmail, 'verification-otp');
    await page.getByLabel('Dígito 1 de 6').fill(secondOtp.otp!);
    await page.getByRole('button', { name: 'Confirmar código' }).click();
    await expect(page).toHaveURL(/\/app\/register\/store/);
    await page.getByLabel('Nombre comercial').fill('Bodega Clon');
    await page.getByLabel('RUC o DNI del negocio').fill(ruc);
    await page.getByRole('button', { name: 'Crear mi tienda' }).click();
    await expect(
      page.getByText('Ese RUC o DNI ya está registrado en otra tienda. Revisa los dígitos.'),
    ).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`accesibilidad WCAG 2.1 AA en registro, verificación y tienda (${theme})`, async ({
      page,
    }) => {
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      const email = uniqueEmail(`a11y-${theme}`);

      await page.goto('./register');
      await assertNoA11yViolations(page);

      await page.getByLabel('Tu nombre completo').fill('Ana Condori');
      await page.getByLabel('Tu correo electrónico').fill(email);
      await page.getByLabel('Crea una contraseña segura').fill(STRONG_PASSWORD);
      await page.getByRole('checkbox', { name: /Acepto los Términos/ }).check();
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();

      await expect(page).toHaveURL(/\/app\/register\/verify/);
      await assertNoA11yViolations(page);

      const { otp } = await readLatestMail(email, 'verification-otp');
      await page.getByLabel('Dígito 1 de 6').fill(otp!);
      await page.getByRole('button', { name: 'Confirmar código' }).click();

      await expect(page).toHaveURL(/\/app\/register\/store/);
      await assertNoA11yViolations(page);
    });
  }
});
