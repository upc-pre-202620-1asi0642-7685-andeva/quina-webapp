import { expect, test } from '@playwright/test';
import {
  acceptInvite,
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  signIn,
  uniqueDni,
  uniqueEmail,
} from './support/flows';

test.describe('vecinos y condiciones de fiado (US04, US06)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el dueño registra un vecino, pacta condiciones, edita, pausa con deshacer y navega las pestañas', async ({
    page,
  }) => {
    test.setTimeout(150_000);
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

    // Preajuste rápido de 0 % también funciona y actualiza la vista previa
    await page.getByRole('button', { name: /Vecino de confianza/ }).click();
    await expect(rates.nth(0)).toHaveValue('0');
    await expect(rates.nth(1)).toHaveValue('0');
    await expect(page.getByText(/Límite S\/ 150\.00/)).toBeVisible();

    await rates.nth(0).fill('20');
    await rates.nth(1).fill('15');
    await page.getByRole('button', { name: 'Abrir fiado' }).click();
    await expect(page.getByText('Listo: Rosa ya puede comprar al fiado.')).toBeVisible();
    await expect(page.getByText('S/ 150.00').first()).toBeVisible();
    await expect(page.getByRole('meter')).toBeVisible();
    await expectAccessible(page);

    // Editar: enlace de regreso y Deshacer cambios en formulario
    await page.getByRole('link', { name: 'Editar datos' }).first().click();
    await expect(page).toHaveURL(/\/app\/customers\/[^/]+\/edit/);
    await expect(page.getByRole('link', { name: 'Volver a Rosa' })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Dirección').fill('Jr. Temporal 999');
    await page.getByRole('button', { name: 'Deshacer cambios' }).click();
    await expect(page.getByLabel('Dirección')).toHaveValue('');
    await page.getByRole('link', { name: 'Volver a Rosa' }).click();

    // Pestañas de la ficha y gestión en ResponsiveSheet con Deshacer
    await page.getByRole('tab', { name: /Pagos/ }).click();
    await expect(page.getByText(/Todavía no registramos pagos/)).toBeVisible();
    await page.getByRole('tab', { name: /Datos y privacidad/ }).click();
    await expect(page.getByText(/Protección de datos/)).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Pausar fiado' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: '¿Pausar el fiado de Rosa?' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Sí, continuar' }).click();
    await expect(page.getByText('Fiado en pausa', { exact: true }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Deshacer' }).click();
    await expect(page.getByText('Fiado activo', { exact: true }).first()).toBeVisible();

    // Atajo a Vender con el vecino preseleccionado
    await page.getByRole('link', { name: 'Fiar en mostrador' }).click();
    await expect(page).toHaveURL(/\/app\/sales\?customerId=/);
    await expect(page.getByText('Rosa Quispe Mamani')).toBeVisible();

    await page.goto('./customers');
    await expect(
      page.getByText('Rosa Quispe Mamani').filter({ visible: true }).first(),
    ).toBeVisible();
    await expectAccessible(page);

    // Filtros por estado
    await page.getByRole('button', { name: /Fiado activo/ }).click();
    await expect(page).toHaveURL(/filter=active/);
    await expect(page.getByText('1 vecino', { exact: true })).toBeVisible();

    // La búsqueda se queda dentro de /app y filtra por nombre
    await page.getByRole('searchbox', { name: 'Buscar vecino' }).fill('Ramírez');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/app\/customers.*q=Ram/);
    await expect(page.getByText(/No encontramos vecinos/)).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar vecino' }).fill('quispe');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('1 vecino', { exact: true })).toBeVisible();
  });

  test('el empleado ve solo lo permitido por RBAC en clientes y no accede a edición ni condiciones', async ({
    page,
  }) => {
    test.setTimeout(210_000);
    await registerOwnerWithStore(page);

    await page.goto('./customers/new');
    await page.getByLabel('Número de documento').fill(uniqueDni());
    await page.getByLabel('Nombres', { exact: true }).fill('Luis');
    await page.getByLabel('Apellidos').fill('Torres Vega');
    await page.getByLabel('Celular').fill('987654322');
    await page.getByLabel('Correo', { exact: true }).fill(uniqueEmail('luis'));
    await page.getByRole('checkbox', { name: /El vecino autoriza/ }).check();
    await page.getByRole('button', { name: 'Registrar vecino' }).click();
    await expect(page).toHaveURL(/\/customers\/([^/]+)\/terms\?new=1/);
    const customerUrl = page.url().replace(/\/terms.*$/, '');

    await page.goto('./team');
    const employee = uniqueEmail('cajero');
    await page.getByRole('button', { name: 'Invitar empleado' }).first().click();
    await page.getByLabel('Nombre', { exact: true }).fill('Ana Ríos');
    await page.getByLabel('Correo', { exact: true }).fill(employee);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${employee}.`)).toBeVisible();

    await page.context().clearCookies();
    await acceptInvite(page, employee);
    await signIn(page, employee);
    await expect(page).toHaveURL(/\/app\/?$/);

    await page.goto(customerUrl);
    await expect(page.getByRole('heading', { name: 'Luis Torres Vega' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar datos' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Pactar condiciones' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);
    await expect(page.getByText(/Solo el dueño puede pactar/)).toBeVisible();
    await expectAccessible(page);

    await page.goto(`${customerUrl}/edit`);
    await expect(page).toHaveURL(/\/app\/?$/);
    await page.goto(`${customerUrl}/terms`);
    await expect(page).toHaveURL(/\/app\/?$/);
  });
});
