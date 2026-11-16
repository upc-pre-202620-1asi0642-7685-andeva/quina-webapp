import { expect, test } from '@playwright/test';
import { addCreditNeighbor } from './support/counter';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('panel de cartera (US19)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('muestra las cuatro métricas, el gráfico Pro, filtros y el puntaje de cada vecino', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await addCreditNeighbor(page, 'Rosa', '300');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./portfolio');
    await expect(page).toHaveURL(/\/app\/portfolio$/);

    // Crit. 1
    for (const label of [
      'Capital prestado',
      'Total vencido en mora',
      'Cobros proyectados del mes',
      'Clientes morosos activos',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // Crit. 6: la prueba Pro trae el gráfico, con su tabla para lectores de pantalla
    await expect(page.getByRole('table', { name: /Lo liquidado, lo pagado/ })).toBeAttached();
    await expect(page.getByRole('link', { name: 'Exportar CSV' })).toBeVisible();

    // Crit. 2: sin cortes todavía, el vecino aparece sin historial en la tabla de escritorio
    const desktopTable = page.getByRole('table', { name: 'Vecinos con fiado' });
    await expect(desktopTable).toBeVisible();
    await expect(desktopTable.getByText('Rosa Quispe')).toBeVisible();
    await expect(desktopTable.getByText('Sin historial')).toBeVisible();

    // Desglose del puntaje en Popover
    await desktopTable.getByRole('button', { name: /Sin historial/ }).click();
    await expect(page.getByText('Desglose del puntaje')).toBeVisible();
    await page.keyboard.press('Escape');

    // Accesibilidad en tema claro y oscuro en escritorio (1440 px)
    await expectAccessible(page);

    // Crit. 5: ordenamiento
    await page.getByRole('link', { name: 'Menor puntaje' }).click();
    await expect(page).toHaveURL(/\/app\/portfolio\?sort=score$/);
    await expect(page.getByRole('link', { name: 'Menor puntaje' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.getByRole('link', { name: 'Mayor uso' }).click();
    await expect(page).toHaveURL(/\/app\/portfolio\?sort=utilization$/);

    // Filtros por URL y estado vacío filtrado
    await page.getByRole('link', { name: 'En mora', exact: true }).click();
    await expect(page).toHaveURL(/filter=overdue/);
    await expect(page.getByRole('heading', { name: 'Sin coincidencias' })).toBeVisible();
    await page.getByRole('link', { name: 'Limpiar filtros' }).click();
    await expect(page).toHaveURL(/\/app\/portfolio$/);

    // Búsqueda por nombre
    await page.getByRole('searchbox', { name: 'Buscar vecino en cartera' }).fill('Rosa');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/app\/portfolio\?q=Rosa/);
    await expect(desktopTable.getByText('Rosa Quispe')).toBeVisible();

    // Vista móvil (390 px): oculta la tabla y muestra tarjetas táctiles en ambos temas
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./portfolio');
    await expect(desktopTable).not.toBeVisible();
    await expect(page.getByText('Rosa Quispe').filter({ visible: true }).first()).toBeVisible();
    await expectAccessible(page);
  });
});
