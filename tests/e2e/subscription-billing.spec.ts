import { expect, test } from '@playwright/test';
import { endTrial, storeIdOf } from './support/collections';
import {
  expectAccessible,
  isolateRateLimitIp,
  registerOwnerWithStore,
  uniqueEmail,
} from './support/flows';

test.describe('Suscripciones SaaS, Mercado Pago y bloqueo por exceso de plan (US23, US25, US26)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('muestra el contador de prueba Pro, permite suscribirse, ver el comprobante e inactivar la renovación automática', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await registerOwnerWithStore(page);

    // US25 crit. 1 y 2: prueba de 14 días de Bodega Pro con contador visible en Ajustes
    await page.goto('./settings');
    await expect(page.getByRole('heading', { name: 'Tu plan: Bodega Pro' })).toBeVisible();
    await expect(page.getByText(/Prueba gratis hasta el .*quedan 14 días/)).toBeVisible();

    // US23 crit. 7: selector Mensual / Anual (-20 %)
    await page.getByRole('button', { name: 'Anual (-20 %)' }).click();
    await expect(page.getByText('S/ 279.00')).toBeVisible();
    await page.getByRole('button', { name: 'Mensual' }).click();
    await expect(page.getByText('S/ 29.00')).toBeVisible();
    await expectAccessible(page);

    // US23 crit. 1 y 2 / D6: iniciar checkout mensual de Bodega Pro y aprobar pago en modo local
    await page.getByRole('button', { name: 'Elegir Bodega Pro' }).click();
    await expect(
      page.getByRole('heading', { name: 'Pasarela local de prueba (Mercado Pago)' }),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Simular pago aprobado' }).click();
    await expect(page.getByText('Pago confirmado. Tu plan ya está activo.')).toBeVisible();

    // US23 crit. 5 / D4: historial de pagos y comprobante imprimible
    const historySection = page.locator('#billing-history');
    await expect(historySection.getByText('Aprobado')).toBeVisible();
    await historySection.getByRole('link', { name: 'Ver recibo' }).first().click();

    await expect(page.getByRole('heading', { name: 'Comprobante de suscripción' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeVisible();
    await expectAccessible(page);

    // US23 crit. 6: cancelar renovación automática conservando el acceso hasta fin de periodo
    await page.getByRole('link', { name: 'Volver a ajustes' }).click();
    await page.getByRole('button', { name: 'Cancelar renovación automática' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar renovación' }).click();
    await expect(page.getByText(/Cancelaste la renovación automática/)).toBeVisible();
    await expectAccessible(page);
  });

  test('D1 / US26 crit. 7: bloquea mutaciones en modo de solo lectura cuando vence la prueba con exceso de uso y desbloquea al pagar', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const { ruc } = await registerOwnerWithStore(page);
    const storeId = await storeIdOf(ruc);

    // Durante la prueba Pro invitamos a un segundo usuario (Casero solo permite 1 usuario)
    await page.goto('./team');
    await page.getByLabel('Nombre', { exact: true }).fill('Carlos Empleado');
    await page.getByLabel('Correo', { exact: true }).fill(uniqueEmail('emp'));
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Invitado', { exact: true })).toBeVisible();

    // Vence la prueba de 14 días: la tienda cae a Casero con 2 usuarios (> 1 permitido)
    await endTrial(storeId);

    await page.goto('./settings');
    await expect(page.getByText('Tu tienda está en modo solo lectura')).toBeVisible();
    await expectAccessible(page);

    // En modo de solo lectura aún puede pagar su suscripción para desbloquear la tienda
    await page.getByRole('button', { name: 'Elegir Bodega Pro' }).click();
    await page.getByRole('button', { name: 'Simular pago aprobado' }).click();
    await expect(page.getByText('Pago confirmado. Tu plan ya está activo.')).toBeVisible();
    await expect(page.getByText('Tu tienda está en modo solo lectura')).toHaveCount(0);
  });
});
