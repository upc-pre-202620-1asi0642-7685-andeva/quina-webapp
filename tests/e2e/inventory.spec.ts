import { expect, test } from '@playwright/test';
import {
  acceptInvite,
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  signIn,
  uniqueEmail,
} from './support/flows';

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
    await expect(page).toHaveURL(/\/app\/inventory\?q=fideos/);
    await expect(page.getByText(/No encontramos productos/)).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(page).toHaveURL(/\/app\/inventory$/);
    await expect(page.getByText('1 producto', { exact: true })).toBeVisible();
  });

  test('un servicio no pide stock y se puede dar de baja y deshacer', async ({ page }) => {
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

    // Deshacer desde el toast de Sileo vuelve a activar el servicio
    await page.getByRole('link', { name: 'Deshacer' }).click();
    await expect(page.getByRole('button', { name: 'Dar de baja' })).toBeVisible();
    await expectAccessible(page);
  });

  test('el dueño registra, edita, da de baja y reactiva proveedores con Deshacer', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);

    await page.goto('./inventory/suppliers');
    await expect(page.getByText('Aún no tienes proveedores')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Registrar proveedor' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Razón social o nombre comercial').fill('Abarrotes Lima SAC');
    await sheet.getByLabel('RUC o DNI').fill('20512345678');
    await sheet.getByLabel('Persona de contacto (opcional)').fill('Rosa Medina');
    await sheet.getByLabel('Teléfono (opcional)').fill('987654321');
    await sheet.getByLabel('Correo electrónico (opcional)').fill('pedidos@abarrotes.pe');
    await sheet.getByRole('button', { name: 'Guardar proveedor' }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByText('Abarrotes Lima SAC')).toBeVisible();
    await expect(page.getByText('Rosa Medina')).toBeVisible();
    await expect(page.getByText('pedidos@abarrotes.pe')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Editar' }).click();
    const editSheet = page.getByRole('dialog');
    await editSheet
      .getByLabel('Razón social o nombre comercial')
      .fill('Abarrotes Lima Mayorista SAC');
    await editSheet.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(editSheet).toBeHidden();
    await expect(page.getByText('Abarrotes Lima Mayorista SAC')).toBeVisible();

    await page.getByRole('button', { name: 'Dar de baja' }).click();
    await page.getByRole('button', { name: 'Sí, dar de baja' }).click();
    await expect(page.getByText('Inactivo', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Deshacer' }).click();
    await expect(page.getByRole('button', { name: 'Dar de baja' })).toBeVisible();
  });

  test('el empleado consulta catálogo y ficha sin ver costos, kardex ni acciones de edición (RBAC US05)', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await registerOwnerWithStore(page);

    // Dueño crea un producto físico
    await page.goto('./inventory/new');
    await page.getByLabel('Nombre', { exact: true }).fill('Leche Gloria 400 g');
    await page.getByLabel('Precio al contado').fill('4.20');
    await page.getByLabel('Precio al fiado').fill('4.50');
    await page.getByLabel('Stock inicial').fill('12');
    await page.getByRole('button', { name: 'Registrar producto' }).click();
    await expect(page).toHaveURL(/\/app\/inventory\/([0-9a-f-]+)\?notice=created$/);
    const productUrl = page.url().replace(/\?notice=created$/, '');
    const productId = productUrl.split('/').pop()!;

    // Dueño invita empleado
    const employee = uniqueEmail('emp-inv');
    await page.goto('./team');
    await page.getByRole('button', { name: 'Invitar empleado' }).first().click();
    await page.getByLabel('Nombre', { exact: true }).fill('Luis Soto');
    await page.getByLabel('Correo', { exact: true }).fill(employee);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${employee}.`)).toBeVisible();

    await page.context().clearCookies();
    await acceptInvite(page, employee);
    await signIn(page, employee);
    await expect(page).toHaveURL(/\/app\/?$/);

    // Empleado consulta Inventario
    await page.goto('./inventory');
    await expect(
      page.getByText('Leche Gloria 400 g').filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Valor del almacén')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Nuevo producto' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Compras y pedidos' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Proveedores' })).toHaveCount(0);
    await expectAccessible(page);

    // Empleado consulta ficha sin costos, kardex ni acciones de gestión
    await page.goto(`./inventory/${productId}`);
    await expect(page.getByRole('heading', { name: 'Leche Gloria 400 g' })).toBeVisible();
    await expect(page.getByText('12 UND').first()).toBeVisible();
    await expect(page.getByText('Costo promedio')).toHaveCount(0);
    await expect(page.getByText('Movimientos de inventario (kardex)')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajustar stock' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registrar merma' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);
    await expectAccessible(page);

    // Rutas restringidas redirigen a inicio
    for (const restricted of [
      './inventory/new',
      `./inventory/${productId}/edit`,
      './inventory/purchases',
      './inventory/suppliers',
    ]) {
      await page.goto(restricted);
      await expect(page).toHaveURL(/\/app\/?$/);
    }
  });
});
