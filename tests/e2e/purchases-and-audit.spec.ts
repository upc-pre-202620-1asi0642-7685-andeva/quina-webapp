import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  uniqueRuc,
} from './support/flows';

// PNG válido de 1x1 píxel transparente para probar el comprobante adjunto
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('compras, costo promedio, reposición, mermas y auditoría (US15–US18)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('alerta stock bajo, arma pedido, registra compra con comprobante, registra merma y audita en CSV', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await registerOwnerWithStore(page);

    // 1. Crear producto con stock crítico (2 en estante <= 10 mínimo)
    await page.goto('./inventory/new');
    await page.getByLabel('Nombre', { exact: true }).fill('Aceite Primor 1 L');
    await page.getByLabel('Precio al contado').fill('9.50');
    await page.getByLabel('Precio al fiado').fill('10.00');
    await page.getByLabel('Stock inicial').fill('2');
    await page.getByLabel('Stock mínimo (opcional)').fill('10');
    await page.getByRole('button', { name: 'Registrar producto' }).click();
    await expect(page.getByText('Registramos Aceite Primor 1 L')).toBeVisible();

    // 2. Verificar alerta de stock bajo en el mostrador (US17 crit. 2)
    await page.goto('./sales');
    await expect(page.getByText('Stock bajo').first()).toBeVisible();

    // 3. Filtrar productos con stock bajo en Inventario y armar pedido de reposición (US17 crit. 3–5)
    await page.goto('./inventory?filter=low');
    await expect(page.getByRole('link', { name: 'Aceite Primor 1 L' })).toBeVisible();

    await page.getByRole('button', { name: 'Armar pedido de reposición' }).click();
    await expect(page).toHaveURL(/\/app\/inventory\/purchases$/);
    await expect(page.getByText('+8 UND')).toBeVisible();
    await expectAccessible(page);

    // 4. Convertir el borrador en compra registrada con proveedor nuevo y comprobante (US15, US16)
    await page
      .locator('section', { hasText: 'Borradores de pedidos de reposición' })
      .getByRole('link', { name: 'Registrar compra' })
      .click();
    await expect(page).toHaveURL(/\/app\/inventory\/purchases\/new\?orderId=/);

    const supplierRuc = uniqueRuc();
    await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Razón social o nombre comercial').fill('Distribuidora Norte SAC');
    await dialog.getByLabel('RUC o DNI').fill(supplierRuc);
    await dialog.getByRole('button', { name: 'Guardar proveedor' }).click();
    await expect(dialog).toBeHidden();

    await page.getByLabel('Serie (opcional)').fill('F001');
    await page.getByLabel('Número', { exact: true }).fill('000101');
    await page.getByLabel('Costo unitario (S/)').fill('6.00');
    await page.getByLabel('Foto o PDF de la factura o boleta (opcional)').setInputFiles({
      name: 'factura-101.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });

    await page.getByRole('button', { name: 'Guardar compra' }).click();
    await expect(page).toHaveURL(/\/app\/inventory\/purchases\/[0-9a-f-]+\?notice=created$/);
    await expect(page.getByRole('heading', { name: 'Distribuidora Norte SAC' })).toBeVisible();
    await expect(page.getByText('factura-101.png')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir o descargar comprobante' })).toBeVisible();
    await expectAccessible(page);

    // 5. Verificar stock actualizado (10 UND), costo promedio (S/ 4.8000) y registrar merma (US16)
    await page.getByRole('link', { name: 'Aceite Primor 1 L' }).click();
    await expect(page).toHaveURL(/\/app\/inventory\/[0-9a-f-]+$/);
    await expect(page.getByText('10 UND').first()).toBeVisible();
    await expect(page.getByText('S/ 4.8000').first()).toBeVisible();

    await page.getByRole('button', { name: 'Registrar merma' }).click();
    const wasteDialog = page.getByRole('dialog');
    await wasteDialog.getByLabel('Cantidad perdida').fill('1');
    await wasteDialog.getByLabel('Motivo de la merma').fill('Botella rota en almacén');
    await wasteDialog.getByRole('button', { name: 'Registrar merma' }).click();
    await expect(page.getByText('Registramos la merma de Aceite Primor 1 L.')).toBeVisible();
    await expect(page.getByText('9 UND').first()).toBeVisible();
    // La merma NO cambia el costo promedio unitario
    await expect(page.getByText('S/ 4.8000').first()).toBeVisible();
    await expect(page.getByText('Baja por merma')).toBeVisible();
    await expect(page.getByText('Entrada por compra')).toBeVisible();
    await expectAccessible(page);

    // 6. Consultar auditoría, filtrar y exportar CSV (US18)
    await page.goto('./audit');
    await expect(page.getByRole('heading', { name: 'Registro de auditoría' })).toBeVisible();
    await expect(page.getByText('Registro de merma').first()).toBeVisible();
    await expect(page.getByText('Registro de compra').first()).toBeVisible();
    await expect(page.getByText('Generación de pedido de reposición').first()).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel('Entidad').selectOption('purchases');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/entityName=purchases/);
    await expect(page.getByText('Registro de compra').first()).toBeVisible();

    const csvResponse = await page.request.get('./api/audit/export?entityName=purchases');
    expect(csvResponse.status()).toBe(200);
    expect(csvResponse.headers()['content-type']).toContain('text/csv');
    const csvBody = await csvResponse.text();
    expect(csvBody).toContain(
      'fecha_utc,usuario,accion,entidad,id_entidad,datos_anteriores,datos_nuevos,ip',
    );
    expect(csvBody).toContain('REGISTER_PURCHASE');
  });
});
