import { expect, test } from '@playwright/test';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('asistente tributario del Nuevo RUS (US21)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('muestra ventas y compras del mes contra el tope y sigue la categoría elegida', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);

    // Crit. 3 y 5: dos barras contra el tope de la categoría 1, con el descargo literal
    await page.goto('./');
    const card = page.getByRole('region', { name: 'Asistente tributario' });
    await expect(card.getByText('Nuevo RUS · Categoría 1')).toBeVisible();
    await expect(card.getByRole('meter', { name: 'Ventas del mes' })).toBeVisible();
    await expect(card.getByRole('meter', { name: 'Compras del mes' })).toBeVisible();
    await expect(card.getByText('S/ 0.00 de S/ 5,000.00 (0 %)')).toHaveCount(2);
    await expect(
      card.getByText(
        'Información referencial. Quina no constituye asesoría ni emite declaraciones ante SUNAT.',
      ),
    ).toBeVisible();
    await expectAccessible(page);

    // Crit. 1: el dueño cambia la categoría en Ajustes
    await card.getByRole('link', { name: 'Cambiar categoría' }).click();
    await expect(page).toHaveURL(/\/app\/settings#tax$/);
    await page.getByLabel('Categoría del Nuevo RUS').selectOption('2');
    await page.getByRole('button', { name: 'Guardar régimen' }).click();
    await expect(page.getByText('Régimen guardado.')).toBeVisible();
    await expectAccessible(page);

    await page.goto('./');
    await expect(page.getByText('S/ 0.00 de S/ 8,000.00 (0 %)')).toHaveCount(2);

    // Fuera del Nuevo RUS el asistente no aplica
    await page.goto('./settings#tax');
    await page.getByLabel('Régimen', { exact: true }).selectOption('RER');
    await page.getByRole('button', { name: 'Guardar régimen' }).click();
    await expect(page.getByText('Régimen guardado.')).toBeVisible();
    await page.goto('./');
    await expect(page.getByRole('region', { name: 'Asistente tributario' })).toHaveCount(0);
  });
});
