import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { runDaily, storeIdOf } from './support/collections';
import { addCreditNeighbor, addProduct, chargeButton } from './support/counter';
import {
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  signIn,
  STRONG_PASSWORD,
} from './support/flows';
import { readLatestMail } from './support/outbox';

// Plan 5 (US14): el portal del vecino, de punta a punta con el outbox.

async function fiarRosa(page: Page) {
  await page.goto('./sales');
  await page.getByRole('combobox', { name: 'Vecino' }).fill('ros');
  await page.getByRole('option', { name: /Rosa Quispe/ }).click();
  await page.getByRole('button', { name: /^Arroz Costeño 1 kg/ }).click();
  await chargeButton(page, 'Fiar S/ 5.00').click();
  await expect(page.getByText('Fiado registrado · S/ 5.00')).toBeVisible();
}

/** El último correo de cobranza para `to` (el outbox guarda el correo con su `portalUrl`). */
async function latestCollectionsMail(to: string, kind: string) {
  const dir = path.join(process.cwd(), '.outbox');
  const names = (await readdir(dir))
    .filter((f) => f.endsWith(`-${kind}.json`))
    .sort()
    .reverse();
  for (const name of names) {
    const mail = JSON.parse(await readFile(path.join(dir, name), 'utf8')) as {
      to: string;
      portalUrl?: string;
    };
    if (mail.to === to) return mail;
  }
  throw new Error(`No hay ${kind} para ${to}`);
}

test.describe('portal del vecino (US14)', () => {
  test('por HTTP no se puede pedir un enlace mágico (D5)', async ({ request }) => {
    const response = await request.post('./api/auth/sign-in/magic-link', {
      data: { email: 'nadie@example.com' },
    });
    expect(response.status()).toBe(404);
  });

  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el enlace del resumen abre el portal, se ven los datos de cobro y el vecino observa un cargo', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { ruc } = await registerOwnerWithStore(page);
    await addProduct(page, 'Arroz Costeño 1 kg', '4.50', '20', { creditPrice: '5.00' });
    const rosa = await addCreditNeighbor(page, 'Rosa', '100');
    await fiarRosa(page);

    // US14.6: el dueño carga su Yape y el vecino lo ve
    await page.goto('./settings');
    await page.getByLabel('Yape', { exact: true }).fill('987654321');
    await page.getByRole('button', { name: 'Guardar datos de cobro' }).click();
    await expect(page.getByText('Listo. Tus vecinos ya ven estos datos')).toBeVisible();

    const storeId = await storeIdOf(ruc);
    await runDaily(request, storeId, new Date(Date.now() + 24 * 3_600_000));
    const mail = await latestCollectionsMail(rosa.email, 'charge-digest');
    expect(mail.portalUrl).toContain('/app/portal/enter?token=');

    const neighbor = await browser.newContext();
    const portal = await neighbor.newPage();
    await isolateRateLimitIp(portal);
    await portal.goto(mail.portalUrl!.replace(/^.*\/app\//, './'));
    await expect(
      portal.getByRole('heading', { name: 'Tu estado de cuenta te espera' }),
    ).toBeVisible();
    await expectAccessible(portal);
    await portal.getByRole('button', { name: 'Ver mi estado de cuenta' }).click();
    await expect(portal).toHaveURL(new RegExp(`/app/portal/${storeId}$`));
    await expect(portal.getByText('Hola, Rosa')).toBeVisible();
    await expect(portal.getByText('987654321')).toBeVisible();
    await expectAccessible(portal);

    await portal
      .getByRole('link', { name: /Corte del/ })
      .first()
      .click();
    await portal.getByRole('button', { name: 'No reconozco este cargo' }).click();
    const dialog = portal.getByRole('dialog');
    await dialog.getByLabel('Tu observación').fill('Yo no saqué ese arroz');
    await expectAccessible(portal);
    await dialog.getByRole('button', { name: 'Enviar a la tienda' }).click();
    await expect(portal.getByText('Listo. La tienda revisará tu observación')).toBeVisible();
    await expectAccessible(portal);

    // D5: el mismo enlace ya no sirve
    await portal.goto(mail.portalUrl!.replace(/^.*\/app\//, './'));
    await portal.getByRole('button', { name: 'Ver mi estado de cuenta' }).click();
    await expect(portal).toHaveURL(/\/app\/portal(\/|$)/);
    await neighbor.close();

    // P7: el dueño ve la observación en el ciclo del vecino
    await page.goto('./customers');
    await page
      .getByRole('link', { name: /Rosa Quispe/ })
      .first()
      .click();
    await page
      .getByRole('link', { name: /Corte del/ })
      .first()
      .click();
    await expect(page.getByText('Lo que dijo el vecino: Yo no saqué ese arroz')).toBeVisible();
  });

  test('entra con su DNI y un código, y crea una contraseña', async ({ page, browser }) => {
    test.setTimeout(180_000);
    await registerOwnerWithStore(page);
    const rosa = await addCreditNeighbor(page, 'Rosa', '100');

    const neighbor = await browser.newContext();
    const portal = await neighbor.newPage();
    await isolateRateLimitIp(portal);
    await portal.goto('./portal/login');
    await expectAccessible(portal);
    await portal.getByLabel('Número de documento').fill(rosa.dni);
    await portal.getByRole('button', { name: 'Enviar código' }).click();
    await expect(portal.getByText(/te enviamos un código a tu correo/)).toBeVisible();
    await expectAccessible(portal);

    const { otp } = await readLatestMail(rosa.email, 'portal-otp');
    await portal.getByLabel('Dígito 1 de 6').fill(otp!);
    await portal.getByRole('button', { name: 'Ver mi cuenta' }).click();
    await expect(portal.getByText('Hola, Rosa')).toBeVisible();

    await portal.getByRole('link', { name: 'Mi perfil' }).click();
    await expect(portal.getByText('Si prefieres, crea una contraseña')).toBeVisible();
    await expect(portal.getByText('Entraste con Google')).toHaveCount(0);
    await portal.getByLabel('Nueva contraseña').fill(STRONG_PASSWORD);
    await portal.getByLabel('Repite la contraseña').fill(STRONG_PASSWORD);
    await portal.getByRole('button', { name: 'Crear contraseña' }).click();
    await expect(portal.getByText('Listo: ya puedes ingresar con tu correo')).toBeVisible();
    await expectAccessible(portal);
    await neighbor.close();

    // US14.5: con la contraseña entra por /login y acaba en su portal (D8)
    const again = await browser.newContext();
    const login = await again.newPage();
    await isolateRateLimitIp(login);
    await signIn(login, rosa.email);
    await expect(login).toHaveURL(/\/app\/portal/);
    await again.close();
  });
});
