import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  uniqueDni,
  uniqueEmail,
} from './support/flows';

test.describe('vecinos y condiciones de fiado (US04, US06)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el dueño registra un vecino con su autorización y le pacta condiciones', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);

    await page.goto('./customers');
    await expect(page.getByRole('heading', { name: 'Aún no tienes vecinos' })).toBeVisible();
    await page.getByRole('link', { name: 'Registrar vecino' }).first().click();
    await expect(page).toHaveURL(/\/app\/customers\/new/);
    await expectAccessible(page);

    await page.getByLabel('Número de documento').fill(uniqueDni());
    await page.getByLabel('Nombres', { exact: true }).fill('Rosa');
    await page.getByLabel('Apellidos').fill('Quispe Mamani');
    await page.getByLabel('Celular').fill('987654321');
    await page.getByLabel('Correo', { exact: true }).fill(uniqueEmail('vecina'));

    // US04 crit. 3: sin la autorización no se puede registrar
    const submit = page.getByRole('button', { name: 'Registrar vecino' });
    await expect(submit).toBeDisabled();
    await page.getByRole('checkbox', { name: /El vecino autoriza/ }).check();
    await submit.click();

    await expect(page).toHaveURL(/\/terms\?new=1/);
    await expect(page.getByText('Registramos a Rosa')).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel('Límite de fiado').fill('150');
    const rates = page.getByLabel('Tasa (%)');
    await rates.nth(0).fill('20');
    // US06: la moratoria sobre el tope del BCRP se rechaza
    await rates.nth(1).fill('18');
    await page.getByRole('button', { name: 'Abrir fiado' }).click();
    await expect(page.getByText(/Supera el tope del BCRP/)).toBeVisible();

    await rates.nth(1).fill('15');
    await page.getByRole('button', { name: 'Abrir fiado' }).click();
    await expect(page.getByText('Listo: Rosa ya puede comprar al fiado.')).toBeVisible();
    await expect(page.getByText('S/ 150.00').first()).toBeVisible();
    await expectAccessible(page);

    await page.goto('./customers');
    await expect(
      page.getByText('Rosa Quispe Mamani').filter({ visible: true }).first(),
    ).toBeVisible();

    // La búsqueda se queda dentro de /app y filtra por nombre
    await page.getByRole('searchbox', { name: 'Buscar vecino' }).fill('Ramírez');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/app\/customers\?q=Ram/);
    await expect(page.getByText(/No encontramos vecinos/)).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar vecino' }).fill('quispe');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('1 vecino', { exact: true })).toBeVisible();
  });
});
