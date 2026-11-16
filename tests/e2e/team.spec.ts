import { expect, test } from '@playwright/test';
import {
  acceptInvite,
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  signIn,
  uniqueEmail,
} from './support/flows';

test.describe('equipo y permisos (US05, US26)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el dueño invita a un empleado, que entra y solo ve lo que su rol permite', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await registerOwnerWithStore(page);

    await page.goto('./team');
    await expect(page.getByText('1 de 3 usuarios de tu plan')).toBeVisible();
    await expectAccessible(page);

    const employee = uniqueEmail('empleado');
    await page.getByRole('button', { name: 'Invitar empleado' }).first().click();
    await page.getByLabel('Nombre', { exact: true }).fill('Ana Ríos');
    await page.getByLabel('Correo', { exact: true }).fill(employee);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${employee}.`)).toBeVisible();
    await expect(
      page.getByText('Invitado', { exact: true }).filter({ visible: true }),
    ).toBeVisible();

    await page.context().clearCookies();
    await acceptInvite(page, employee);
    await expectAccessible(page);
    await signIn(page, employee);
    await expect(page).toHaveURL(/\/app\/?$/);

    // US05: el empleado no tiene equipo ni ajustes, ni en el menú ni por URL
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Equipo' })).toHaveCount(0);
    await page.goto('./team');
    await expect(page).toHaveURL(/\/app\/?$/);
    await page.goto('./settings');
    await expect(page).toHaveURL(/\/app\/?$/);

    // Registra vecinos, pero no pacta condiciones
    await page.goto('./customers/new');
    await expect(page.getByRole('heading', { name: 'Registrar vecino' })).toBeVisible();
  });

  test('gestiona invitaciones, desactivación y reactivación en escritorio y celular (390 px)', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const { email: ownerEmail } = await registerOwnerWithStore(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./team');

    // Tarjeta colapsable de roles en lenguaje claro
    await page.getByRole('button', { name: /¿Qué puede hacer un empleado de mostrador\?/ }).click();
    await expect(page.getByText('Empleado de mostrador', { exact: true })).toBeVisible();
    await expect(page.getByText('Solo tú como dueño', { exact: true })).toBeVisible();

    // Validación inline sin borrar campos en el modal/sheet de invitación
    await page.getByRole('button', { name: 'Invitar empleado' }).first().click();
    await expectAccessible(page);
    await page.getByLabel('Nombre', { exact: true }).fill('A2');
    await page.getByLabel('Correo', { exact: true }).fill('mal-correo');
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Escribe su nombre solo con letras.')).toBeVisible();
    await expect(page.getByText('Revisa el correo; parece incompleto.')).toBeVisible();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('A2');
    await expect(page.getByLabel('Correo', { exact: true })).toHaveValue('mal-correo');

    const empA = uniqueEmail('ana');
    await page.getByLabel('Nombre', { exact: true }).fill('Ana Ríos');
    await page.getByLabel('Correo', { exact: true }).fill(empA);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${empA}.`)).toBeVisible();

    // Reenviar y cancelar invitación
    const desktopTable = page.locator('table');
    await desktopTable.getByRole('button', { name: 'Reenviar' }).click();
    await expect(
      page.getByText('Le enviamos un enlace nuevo; el anterior ya no sirve.'),
    ).toBeVisible();

    await desktopTable.getByRole('button', { name: 'Cancelar invitación' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar invitación' }).click();
    await expect(page.getByText('Invitación de Ana Ríos cancelada.')).toBeVisible();
    await expect(page.getByText('Aún no tienes empleados en tu tienda')).toBeVisible();

    // Invitar y activar un segundo empleado via ?invite=1 para probar desactivar y reactivar
    const empB = uniqueEmail('luis');
    await page.goto('./team?invite=1');
    await page.getByLabel('Nombre', { exact: true }).fill('Luis Vega');
    await page.getByLabel('Correo', { exact: true }).fill(empB);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${empB}.`)).toBeVisible();

    await page.context().clearCookies();
    await acceptInvite(page, empB);
    await signIn(page, ownerEmail);
    await expect(page).toHaveURL(/\/app\/?$/);
    await page.goto('./team');
    await expect(desktopTable.getByText('Activo', { exact: true })).toBeVisible();

    // Desactivar empleado
    await desktopTable.getByRole('button', { name: 'Desactivar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByText('Luis Vega fue desactivado.')).toBeVisible();

    // Pestaña Desactivados en móvil (390 px) con auditoría WCAG en claro y oscuro
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: /Desactivados \(1\)/ }).click();
    const mobileCard = page.locator('article').filter({ hasText: 'Luis Vega' });
    await expect(mobileCard).toBeVisible();
    await expectAccessible(page);

    await mobileCard.getByRole('button', { name: 'Reactivar' }).click();
    await expect(page.getByText('Luis Vega volvió a quedar activo.')).toBeVisible();
    await page.getByRole('tab', { name: /Activos e invitados \(2\)/ }).click();
    await expect(page.locator('article').filter({ hasText: 'Luis Vega' })).toBeVisible();
  });

  test('Suscripción muestra el uso del plan y lo bloqueado', async ({ page }) => {
    await registerOwnerWithStore(page);
    await page.goto('./settings/subscription');
    await expect(page.getByRole('heading', { name: 'Tu plan: Bodega Pro' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Planes' })).toBeVisible();
    await expectAccessible(page);
  });
});
