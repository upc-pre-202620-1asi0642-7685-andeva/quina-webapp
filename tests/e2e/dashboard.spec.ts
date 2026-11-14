import { expect, test } from '@playwright/test';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('Inicio con widgets personalizables', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('el dueño ve sus widgets, los ordena, quita y agrega, y el diseño se guarda', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await page.goto('./');

    const grid = page.getByRole('list', { name: 'Widgets de Inicio' });
    for (const name of ['Accesos rápidos', 'Por cobrar', 'Caja de hoy', 'Plata en la calle']) {
      await expect(grid.getByRole('heading', { name })).toBeVisible();
    }
    await expect(grid.getByRole('heading', { name: 'Mes en curso' })).toHaveCount(0);
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Personalizar' }).click();
    await page.getByRole('button', { name: 'Subir Por cobrar' }).click();
    await page.getByRole('button', { name: 'Quitar Tu plan de Inicio' }).click();
    await page.getByRole('button', { name: 'Agregar widget' }).click();
    await page.getByRole('button', { name: 'Agregar Mes en curso' }).click();
    await page.keyboard.press('Escape');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByText('Tu Inicio quedó guardado')).toBeVisible();
    // Mientras se ordena el contenido es inerte; al terminar ya se lee el widget nuevo
    await expect(grid.getByRole('heading', { name: 'Mes en curso' })).toBeVisible();

    await page.reload();
    const headings = grid.getByRole('heading', { level: 2 });
    await expect(headings.first()).toHaveText('Por cobrar');
    await expect(grid.getByRole('heading', { name: 'Tu plan' })).toHaveCount(0);
    await expect(grid.getByRole('heading', { name: 'Mes en curso' })).toBeVisible();
  });

  test('las migas de pan muestran dónde está y llevan de vuelta', async ({ page }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await page.goto('./inventory/purchases');

    const crumbs = page.getByRole('navigation', { name: 'Estás en' });
    await expect(crumbs.getByText('Compras')).toHaveAttribute('aria-current', 'page');
    await crumbs.getByRole('link', { name: 'Inventario' }).click();
    await expect(page).toHaveURL(/\/app\/inventory\/?$/);
    await expectAccessible(page);
  });
});
