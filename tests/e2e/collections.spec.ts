import { expect, test, type Page } from '@playwright/test';
import { endTrial, openCutOff, runDaily, storeIdOf } from './support/collections';
import { addCreditNeighbor, addProduct, chargeButton } from './support/counter';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

async function fiarRosa(page: Page) {
  await page.goto('./sales');
  await page.getByRole('combobox', { name: 'Vecino' }).fill('ros');
  await page.getByRole('option', { name: /Rosa Quispe/ }).click();
  await page.getByRole('button', { name: /^Arroz Costeño 1 kg/ }).click();
  await chargeButton(page, 'Fiar S/ 5.00').click();
  await expect(page.getByText('Fiado registrado · S/ 5.00')).toBeVisible();
}

async function openRosa(page: Page) {
  await page.goto('./customers');
  await page
    .getByRole('link', { name: /Rosa Quispe/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Rosa Quispe' })).toBeVisible();
}

test.describe('corte y cobranza (US10 a US13)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el corte liquida el ciclo y se cobra completo con vuelto y recibo', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const { ruc } = await registerOwnerWithStore(page);
    await addProduct(page, 'Arroz Costeño 1 kg', '4.50', '20', { creditPrice: '5.00' });
    await addCreditNeighbor(page, 'Rosa', '100');
    await fiarRosa(page);

    const storeId = await storeIdOf(ruc);
    const cutOff = await openCutOff(storeId);
    // 06:00 en Lima del día siguiente al corte
    await runDaily(request, storeId, new Date(cutOff.getTime() + 6 * 3_600_000 + 1));

    await openRosa(page);
    await expect(page.getByRole('heading', { name: 'Estado de cuenta' })).toBeVisible();
    await expectAccessible(page);
    await page
      .getByRole('link', { name: /Corte del/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /Ciclo con corte del/ })).toBeVisible();
    await expect(page.getByText('Interés compensatorio')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('link', { name: 'Cobrar' }).click();
    await expect(page.getByRole('heading', { name: 'Cobrar a Rosa Quispe' })).toBeVisible();
    await page.getByLabel('Recibido').fill('10');
    await expect(page.getByText('Vuelto')).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: /^Cobrar S\/ / }).click();

    await expect(page.getByRole('heading', { name: 'Recibo R-000001' })).toBeVisible();
    await expect(
      page.getByText(/Cobro registrado\. Entrega S\/ \d+\.\d{2} de vuelto\./),
    ).toBeVisible();
    await expectAccessible(page);

    await page.goto('./collections');
    await expect(page.getByText('No hay ciclos por cobrar.')).toBeVisible();
    await page.getByRole('link', { name: /Avisos de hoy/ }).click();
    await expectAccessible(page);
  });

  test('en Casero se envía el resumen con un botón y el dueño anula un cargo observado', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { ruc } = await registerOwnerWithStore(page);
    await endTrial(await storeIdOf(ruc));
    await addProduct(page, 'Arroz Costeño 1 kg', '4.50', '20', { creditPrice: '5.00' });
    await addCreditNeighbor(page, 'Rosa', '100');
    await fiarRosa(page);

    await page.goto('./collections');
    await expect(page.getByRole('heading', { name: 'Avisos a tus vecinos' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Enviar resumen de compras' }).click();
    await expect(page.getByText('Se envió 1 aviso.')).toBeVisible();

    await openRosa(page);
    await page
      .getByRole('link', { name: /Corte del/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Registrar observación' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('¿Qué dijo el vecino?').fill('Dice que no compró arroz');
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Guardar observación' }).click();
    await expect(page.getByText('Observación registrada.', { exact: false })).toBeVisible();
    await expect(page.getByText('Lo que dijo el vecino: Dice que no compró arroz')).toBeVisible();

    await page.getByRole('button', { name: 'Anular' }).click();
    await page.getByRole('dialog').getByLabel('Motivo de la anulación').fill('Se cobró por error');
    await page.getByRole('dialog').getByRole('button', { name: 'Anular cargo' }).click();
    await expect(page.getByText(/Cargo anulado\. Los productos volvieron al stock/)).toBeVisible();
    await expect(page.getByText('Anulado', { exact: true })).toBeVisible();
    await expectAccessible(page);
  });
});
