import { expect, test } from '@playwright/test';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('reportes con IA (US20)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('consolida el rango, analiza con IA descontando la cuota y se puede imprimir', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await page.goto('./reports');

    // Crit. 1
    for (const label of [
      'Ventas al contado',
      'Ventas al fiado',
      'Intereses por fiar cobrados',
      'Intereses por atraso cobrados',
      'Costo de lo vendido',
      'Margen bruto',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // Crit. 6
    await expect(page.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeVisible();
    await expectAccessible(page);

    // Crit. 2, 4 y 5: la prueba Pro trae 20 consultas al mes
    await expect(page.getByText('Te quedan 20 consultas de 20 este mes')).toBeVisible();
    await page.getByRole('button', { name: 'Analizar con IA' }).click();
    await expect(page.getByText('Revisa tu fiado')).toBeVisible();
    await expect(page.getByText('Te quedan 19 consultas de 20 este mes')).toBeVisible();
    await expectAccessible(page);

    // Un rango inválido avisa y vuelve al mes en curso
    await page.goto('./reports?from=2026-12-10&to=2026-12-01');
    await expect(page.getByText(/Revisa las fechas/)).toBeVisible();
  });
});
