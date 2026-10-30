import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readLatestMail } from './support/outbox';

const STRONG_PASSWORD = 'Bodega#2026x';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
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

test.describe('ingreso, bloqueo y Google OAuth (US02)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('5 contraseñas fallidas muestran el mensaje de bloqueo temporal de §7.4', async ({
    page,
  }) => {
    const email = uniqueEmail('lock');

    await page.goto('./register');
    await page.getByLabel('Tu nombre completo').fill('Mario Huamán');
    await page.getByLabel('Tu correo electrónico').fill(email);
    await page.getByLabel('Crea una contraseña segura').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/register\/verify/);
    const { otp } = await readLatestMail(email, 'verification-otp');
    await page.getByLabel('Dígito 1 de 6').fill(otp!);
    await page.getByRole('button', { name: 'Confirmar código' }).click();
    await expect(page).toHaveURL(/\/app\/register\/store/);

    await page.context().clearCookies();
    await page.goto('./login');
    await page.getByLabel('Correo electrónico').fill(email);

    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel('Contraseña', { exact: true }).fill('Equivocada#99');
      await page.getByRole('button', { name: 'Ingresar' }).click();
      await expect(
        page.getByText('El correo o la contraseña no coinciden. Revisa e inténtalo de nuevo.'),
      ).toBeVisible();
    }

    await page.getByLabel('Contraseña', { exact: true }).fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(
      page.getByText(
        'Cuenta temporalmente bloqueada por seguridad. Inténtalo de nuevo en 15 minutos o restablece tu contraseña.',
      ),
    ).toBeVisible();
  });

  test('el botón "Continuar con Google" redirige a accounts.google.com', async ({ page }) => {
    let googleUrl = '';
    await page.route('https://accounts.google.com/**', async (route) => {
      googleUrl = route.request().url();
      await route.fulfill({ status: 200, body: 'ok' });
    });

    await page.goto('./login');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await expect.poll(() => googleUrl).toContain('accounts.google.com');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`accesibilidad WCAG 2.1 AA en login (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await page.goto('./login');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
