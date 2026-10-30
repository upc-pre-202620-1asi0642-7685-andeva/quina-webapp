import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readLatestMail } from './support/outbox';

const INITIAL_PASSWORD = 'Bodega#2026x';
const NEW_PASSWORD = 'NuevoFiado$2026';

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

async function assertNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('recuperación de contraseña (US02)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('muestra el mismo texto para correos inexistentes y existentes, cambia la clave y el enlace usado una 2.ª vez falla', async ({
    page,
  }) => {
    const expectedText =
      'Si el correo ingresado se encuentra registrado, recibirás un enlace de recuperación en breve';

    // 1. Correo inexistente
    await page.goto('./auth/forgot-password');
    await page.getByLabel('Correo de tu cuenta').fill(uniqueEmail('no-existe'));
    await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
    await expect(page.getByText(expectedText)).toBeVisible();

    // 2. Registrar y verificar un usuario real
    const email = uniqueEmail('rec');
    await page.goto('./register');
    await page.getByLabel('Tu nombre completo').fill('Pedro Mamani');
    await page.getByLabel('Tu correo electrónico').fill(email);
    await page.getByLabel('Crea una contraseña segura').fill(INITIAL_PASSWORD);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/register\/verify/);
    const { otp } = await readLatestMail(email, 'verification-otp');
    await page.getByLabel('Dígito 1 de 6').fill(otp!);
    await page.getByRole('button', { name: 'Confirmar código' }).click();
    await expect(page).toHaveURL(/\/app\/register\/store/);
    await page.context().clearCookies();

    // 3. Solicitar recuperación para el correo existente → mismo mensaje exacto
    await page.goto('./auth/forgot-password');
    await page.getByLabel('Correo de tu cuenta').fill(email);
    await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
    await expect(page.getByText(expectedText)).toBeVisible();

    // 4. Abrir el enlace del outbox y definir contraseña nueva
    const resetMail = await readLatestMail(email, 'password-reset');
    expect(resetMail.url).toBeTruthy();
    const token = new URL(resetMail.url!).pathname.split('/').pop()!;
    await page.goto(resetMail.url!);
    await expect(page).toHaveURL(/\/app\/auth\/reset-password\?token=/);

    await page.getByLabel('Nueva contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
    await expect(page).toHaveURL(/\/app\/login/);

    // 5. Usar el mismo token por 2.ª vez falla
    await page.goto(`./auth/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByLabel('Nueva contraseña').fill('OtraClave#2026x');
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
    await expect(
      page.getByText(
        'Este enlace ya fue usado o venció. Solicita uno nuevo para cambiar tu contraseña.',
      ),
    ).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`accesibilidad WCAG 2.1 AA en forgot-password y reset-password (${theme})`, async ({
      page,
    }) => {
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);

      await page.goto('./auth/forgot-password');
      await assertNoA11yViolations(page);

      await page.goto('./auth/reset-password?token=token-de-prueba');
      await assertNoA11yViolations(page);
    });
  }
});
