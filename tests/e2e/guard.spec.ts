import { randomUUID } from 'node:crypto';
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

test.describe('guardia de rutas para usuarios sin tienda o sin sesión', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('un usuario PENDING_OWNER que navega a / o /profile es redirigido a /register/store', async ({
    page,
  }) => {
    const email = uniqueEmail('pending');

    await page.goto('./register');
    await page.getByLabel('Tu nombre completo').fill('Julio Paredes');
    await page.getByLabel('Tu correo electrónico').fill(email);
    await page.getByLabel('Crea una contraseña segura').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/register\/verify/);

    const { otp } = await readLatestMail(email, 'verification-otp');
    await page.getByLabel('Dígito 1 de 6').fill(otp!);
    await page.getByRole('button', { name: 'Confirmar código' }).click();
    await expect(page).toHaveURL(/\/app\/register\/store/);

    // Intentar entrar al panel o al perfil sin haber creado la tienda
    await page.goto('./');
    await expect(page).toHaveURL(/\/app\/register\/store/);

    await page.goto('./profile');
    await expect(page).toHaveURL(/\/app\/register\/store/);
  });
});
