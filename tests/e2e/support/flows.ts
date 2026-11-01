import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { readLatestMail } from './outbox';

export const STRONG_PASSWORD = 'Bodega#2026x';

export const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID()}@example.com`;

export function uniqueRuc(): string {
  return `20${String(Math.floor(Math.random() * 900_000_000) + 100_000_000)}`;
}

export function uniqueDni(): string {
  return String(Math.floor(Math.random() * 90_000_000) + 10_000_000);
}

/** Cada prueba con su IP: el limitador de Better Auth no mezcla casos. */
export async function isolateRateLimitIp(page: Page) {
  const b = () => Math.floor(Math.random() * 250) + 1;
  const ip = `198.51.${b()}.${b()}`;
  await page.route('**/api/auth/**', async (route) => {
    await route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } });
  });
}

/** Registro de autoservicio (US24): termina en el panel con la prueba Pro. */
export async function registerOwnerWithStore(page: Page) {
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
  return { email, storeName, ruc };
}

export async function signIn(page: Page, email: string, password = STRONG_PASSWORD) {
  await page.goto('./login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Abre el enlace de cuenta del correo y define la contraseña (decisión 2). */
export async function acceptInvite(page: Page, email: string) {
  const mail = await readLatestMail(email, 'account-setup');
  await page.goto(mail.url!.replace(/^.*\/app\//, './'));
  await page.getByLabel('Contraseña', { exact: true }).fill(STRONG_PASSWORD);
  await page.getByRole('button', { name: 'Crear mi contraseña' }).click();
  await expect(page.getByText('Listo. Ya puedes ingresar')).toBeVisible();
}

/** WCAG 2.1 AA en los dos temas (AGENTS.md §8). */
export async function expectAccessible(page: Page) {
  // El puntero que queda sobre una fila deja su hover: se mide en reposo
  await page.mouse.move(0, 0);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    // Las transiciones de color terminan antes de medir el contraste
    await page.waitForTimeout(350);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    // Resumen corto: regla, elemento y motivo de cada falla
    const found = results.violations.flatMap((v) =>
      v.nodes.map(
        (n) => `${v.id} ${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1] ?? ''}`,
      ),
    );
    expect(found, `tema ${theme}`).toEqual([]);
  }
}
