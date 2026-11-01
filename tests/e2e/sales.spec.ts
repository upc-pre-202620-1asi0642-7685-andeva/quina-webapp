import { expect, test, type Page } from '@playwright/test';
import { addProduct, cart } from './support/counter';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('venta al contado en el mostrador (US07)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('cobra con vuelto, descuenta stock y suma a la caja de hoy', async ({ page }) => {
    test.setTimeout(120_000);
    await registerOwnerWithStore(page);
    await addProduct(page, 'Arroz Costeño 1 kg', '4.50', '2');

    await page.goto('./');
    await page.getByRole('link', { name: 'Vender' }).first().click();
    await expect(page).toHaveURL(/\/app\/sales$/);
    await expectAccessible(page);

    const product = page.getByRole('button', { name: /^Arroz Costeño 1 kg/ });
    await product.click();
    await product.click();
    // Ya no queda más stock para sumar
    await expect(product).toBeDisabled();

    const panel = await cart(page);
    // US07 crit. 6: más de lo que hay en stock se avisa antes de cobrar
    await panel.getByLabel('Cantidad de Arroz Costeño 1 kg').fill('3');
    await expect(
      panel.getByText('No alcanza el stock de Arroz Costeño 1 kg: quedan 2.'),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Cobrar/ })).toBeDisabled();
    await panel.getByLabel('Cantidad de Arroz Costeño 1 kg').fill('2');

    // US07 crit. 3: el vuelto se calcula en vivo
    await panel.getByLabel('Recibido').fill('20');
    await expect(panel.getByText('S/ 11.00')).toBeVisible();
    await expectAccessible(page);
    await panel.getByRole('button', { name: 'Cobrar S/ 9.00' }).click();

    await expect(page.getByText('Venta registrada · S/ 9.00')).toBeVisible();
    await expect(page.getByText('Agotado')).toBeVisible();
    await expect(product).toBeDisabled();

    // D6: la caja de hoy del dueño
    await page.goto('./');
    const box = page.getByRole('region', { name: 'Caja de hoy' });
    await expect(box.getByText('1 venta al contado')).toBeVisible();
    await expect(box.getByText('S/ 9.00').first()).toBeVisible();
    await expectAccessible(page);

    // US07 crit. 4: con Yape no se pide lo recibido
    await payBreadWithYape(page);
    await expect(page.getByText('Venta registrada · S/ 1.20')).toBeVisible();
  });
});

async function payBreadWithYape(page: Page) {
  await addProduct(page, 'Pan francés', '0.40', '10');
  await page.goto('./sales');
  const bread = page.getByRole('button', { name: /^Pan francés/ });
  await bread.click();
  await bread.click();
  await bread.click();
  const panel = await cart(page);
  await panel.getByText('Yape', { exact: true }).click();
  await expect(panel.getByLabel('Recibido')).toBeHidden();
  await panel.getByRole('button', { name: 'Cobrar S/ 1.20' }).click();
}
