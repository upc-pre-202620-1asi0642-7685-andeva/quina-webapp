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
    await page.goto('./settings/subscription');
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

    // US23 crit. 5 / D4: historial de pagos en escritorio y tarjetas móviles a 390 px
    const historySection = page.locator('#billing-history');
    await expect(
      historySection.getByText('Aprobado').filter({ visible: true }).first(),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(historySection.locator('table')).toBeHidden();
    await expect(
      historySection.getByText('Aprobado').filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      historySection.getByRole('link', { name: 'Ver recibo' }).filter({ visible: true }).first(),
    ).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
    await expectAccessible(page);

    await page.setViewportSize({ width: 1280, height: 720 });
    await historySection
      .getByRole('link', { name: 'Ver recibo' })
      .filter({ visible: true })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Comprobante de suscripción' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeVisible();
    await expectAccessible(page);

    // US23 crit. 6: cancelar renovación automática conservando el acceso hasta fin de periodo
    await page.getByRole('link', { name: 'Volver a suscripción' }).click();
    await page.getByRole('button', { name: 'Cancelar renovación automática' }).click();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Sí, cancelar renovación' }).click();
    await expect(page.getByText(/Cancelaste la renovación automática/)).toBeVisible();
    await expectAccessible(page);
  });

  test('D1 / US26 crit. 7: bloquea mutaciones en modo de solo lectura cuando vence la prueba con exceso de uso, muestra medidores ámbar/error y desbloquea al pagar', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const { ruc } = await registerOwnerWithStore(page);
    const storeId = await storeIdOf(ruc);

    // Durante la prueba Pro invitamos a un segundo usuario (Casero solo permite 1 usuario)
    await page.goto('./team');
    await page.getByRole('button', { name: 'Invitar empleado' }).first().click();
    await page.getByLabel('Nombre', { exact: true }).fill('Carlos Empleado');
    await page.getByLabel('Correo', { exact: true }).fill(uniqueEmail('emp'));
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(
      page.getByText('Invitado', { exact: true }).filter({ visible: true }),
    ).toBeVisible();

    // Vence la prueba de 14 días: la tienda cae a Casero con 2 usuarios (> 1 permitido)
    await endTrial(storeId);

    await page.goto('./settings/subscription');
    await expect(page.getByText('Tu tienda está en modo solo lectura')).toBeVisible();
    const usersMeter = page.getByRole('meter', { name: 'Usuarios' });
    await expect(usersMeter.locator('[data-status="error"]')).toBeVisible();
    await expectAccessible(page);

    // En modo de solo lectura aún puede pagar su suscripción para desbloquear la tienda
    await page.getByRole('button', { name: 'Elegir Bodega Pro' }).click();
    await page.getByRole('button', { name: 'Simular pago aprobado' }).click();
    await expect(page.getByText('Pago confirmado. Tu plan ya está activo.')).toBeVisible();
    await expect(page.getByText('Tu tienda está en modo solo lectura')).toHaveCount(0);

    // Al llegar al 100 % (>= 85 %) del límite de usuarios en Bodega Pro (3 de 3), el medidor pasa a ámbar
    await page.goto('./team');
    await page.getByRole('button', { name: 'Invitar empleado' }).first().click();
    await page.getByLabel('Nombre', { exact: true }).fill('Ana Empleada');
    await page.getByLabel('Correo', { exact: true }).fill(uniqueEmail('emp2'));
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Ana Empleada').filter({ visible: true })).toBeVisible();

    await page.goto('./settings/subscription');
    await expect(usersMeter.locator('[data-status="warning"]')).toBeVisible();
    await expectAccessible(page);
  });
});
