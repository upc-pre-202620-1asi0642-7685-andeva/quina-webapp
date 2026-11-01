import { expect, test } from '@playwright/test';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

// PNG de 1 × 1 px: basta para probar la subida sin archivos en el repositorio
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('catálogo con precio dual (US03)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el dueño registra un producto, cambia su precio y ajusta su stock', async ({ page }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);

    await page.goto('./inventory');
    await expect(page.getByRole('heading', { name: 'Aún no tienes productos' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('link', { name: 'Nuevo producto' }).first().click();
    await expect(page).toHaveURL(/\/app\/inventory\/new/);
    await expectAccessible(page);

    await page.getByLabel('Nombre', { exact: true }).fill('Arroz Costeño 1 kg');
    await page.getByLabel('Marca (opcional)').fill('Costeño');
    await page.getByLabel('Precio al contado').fill('4.50');
    // US03 crit. 6: el fiado no puede ser más barato que el contado
    await page.getByLabel('Precio al fiado').fill('4.00');
    await page.getByLabel('Stock inicial').fill('20');
    await page.getByLabel('Foto del producto (opcional)').setInputFiles({
      name: 'arroz.png',
      mimeType: 'image/png',
      buffer: PIXEL_PNG,
    });
    await page.getByRole('button', { name: 'Registrar producto' }).click();
    await expect(page.getByText('no puede ser menor que el de contado')).toBeVisible();

    await page.getByLabel('Precio al fiado').fill('5.00');
    await page.getByRole('button', { name: 'Registrar producto' }).click();
    await expect(page.getByText('Registramos Arroz Costeño 1 kg')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Foto de Arroz Costeño 1 kg' })).toBeVisible();
    await expect(page.getByText('20 UND').first()).toBeVisible();
    await expect(page.getByText('Todavía no cambiaste sus precios.')).toBeVisible();
    await expectAccessible(page);

    // US03 crit. 4: el cambio de precio queda en el historial
    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await page.getByLabel('Precio al fiado').fill('5.20');
    await page.getByLabel('Motivo del cambio de precio (opcional)').fill('Subió el proveedor');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Guardamos los cambios de Arroz Costeño 1 kg')).toBeVisible();
    await expect(page.getByText('Fiado: S/ 5.00 → S/ 5.20')).toBeVisible();
    await expect(page.getByText('Subió el proveedor')).toBeVisible();

    // D1: conteo físico con motivo
    await page.getByRole('button', { name: 'Ajustar stock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajustar stock' });
    await dialog.getByLabel('Stock contado').fill('18');
    await dialog.getByLabel('Motivo').fill('Conteo del mes');
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Guardar conteo' }).click();
    await expect(page.getByText('Actualizamos el stock de Arroz Costeño 1 kg')).toBeVisible();
    await expect(page.getByText('18 UND').first()).toBeVisible();

    await page.goto('./inventory');
    await expect(page.getByText('1 producto', { exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar producto' }).fill('fideos');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/app\/inventory\?q=fideos/);
    await expect(page.getByText(/No encontramos productos/)).toBeVisible();
  });

  test('un servicio no pide stock y se puede dar de baja', async ({ page }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);

    await page.goto('./inventory/new');
    await page.getByLabel('Nombre', { exact: true }).fill('Recarga Claro');
    await page.getByRole('checkbox', { name: 'Es un servicio (no lleva stock)' }).check();
    await expect(page.getByLabel('Stock inicial')).toBeHidden();
    await page.getByLabel('Precio al contado').fill('10');
    await page.getByLabel('Precio al fiado').fill('10');
    await page.getByRole('button', { name: 'Registrar producto' }).click();
    await expect(page.getByText('Es un servicio: no lleva stock.')).toBeVisible();

    await page.getByRole('button', { name: 'Dar de baja' }).click();
    await page.getByRole('button', { name: 'Sí, dar de baja' }).click();
    await expect(page.getByRole('button', { name: 'Volver a vender' })).toBeVisible();
    await expect(page.getByText('De baja', { exact: true })).toBeVisible();
    await expectAccessible(page);
  });
});
