import { expect, test } from '@playwright/test';
import { addCreditNeighbor } from './support/counter';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('panel de cartera (US19)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('muestra las cuatro métricas, el gráfico Pro y el puntaje de cada vecino', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await addCreditNeighbor(page, 'Rosa', '300');

    await page.goto('./');
    await page.getByRole('link', { name: 'Cartera' }).first().click();
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
    // Crit. 2: sin cortes todavía, el vecino aparece sin historial
    await expect(page.getByText('Sin historial')).toBeVisible();
    await expectAccessible(page);

    // Crit. 5
    await page.getByRole('link', { name: 'Menor puntaje' }).click();
    await expect(page).toHaveURL(/\/app\/portfolio\?sort=score$/);
    await expect(page.getByRole('link', { name: 'Menor puntaje' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
