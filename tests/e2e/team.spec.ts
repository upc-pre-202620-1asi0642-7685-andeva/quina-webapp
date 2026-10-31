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
    await page.getByLabel('Nombre', { exact: true }).fill('Ana Ríos');
    await page.getByLabel('Correo', { exact: true }).fill(employee);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText(`Invitación enviada a ${employee}.`)).toBeVisible();
    await expect(page.getByText('Invitado', { exact: true })).toBeVisible();

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

  test('Ajustes muestra el uso del plan y lo bloqueado', async ({ page }) => {
    await registerOwnerWithStore(page);
    await page.goto('./settings');
    await expect(page.getByRole('heading', { name: 'Tu plan: Bodega Pro' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Planes' })).toBeVisible();
    await expectAccessible(page);
  });
});
