import { expect, test } from '@playwright/test';
import { addCreditNeighbor, addProduct, cart, chargeButton } from './support/counter';
import { expectAccessible, isolateRateLimitIp, registerOwnerWithStore } from './support/flows';

test.describe('venta al fiado en el mostrador (US08)', () => {
  test.beforeEach(async ({ page }) => {
    await isolateRateLimitIp(page);
  });

  test('fía en 3 toques al precio de crédito y bloquea lo que pasa el límite', async ({ page }) => {
    test.setTimeout(150_000);
    await registerOwnerWithStore(page);
    await addProduct(page, 'Arroz Costeño 1 kg', '4.50', '20', { creditPrice: '5.00' });
    await addCreditNeighbor(page, 'Rosa', '12');

    await page.goto('./sales');
    await expect(page.getByRole('heading', { name: 'Vender' })).toBeVisible();

    // US08 crit. 1: vecino, producto y confirmar; escribir el nombre no es un toque
    let taps = 0;
    await page.getByRole('combobox', { name: 'Vecino' }).fill('ros');
    await page.getByRole('option', { name: /Rosa Quispe/ }).click();
    taps++;
    await expect(page.getByText('Disponible S/ 12.00')).toBeVisible();
    const rice = page.getByRole('button', { name: /^Arroz Costeño 1 kg/ });
    // US08 crit. 4: en el fiado se ve el precio de crédito
    await expect(rice).toContainText('S/ 5.00');
    await rice.click();
    taps++;
    await expectAccessible(page);
    await chargeButton(page, 'Fiar S/ 5.00').click();
    taps++;
    expect(taps).toBe(3);

    // US08 crit. 5: toast y deuda actualizada al instante
    await expect(page.getByText('Fiado registrado · S/ 5.00')).toBeVisible();
    await expect(page.getByText('Disponible S/ 7.00')).toBeVisible();

    // US08 crit. 2: lo que pasa el límite se bloquea con el monto exacto
    await rice.click();
    await rice.click();
    const panel = await cart(page);
    await expect(panel.getByText('Excede el límite disponible por S/ 3.00.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Fiar S/ 10.00' })).toBeDisabled();
    await expectAccessible(page);

    // Al contado el mismo vecino sí puede llevarlo, al precio de contado
    await panel.getByText('Contado', { exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Cobrar S/ 9.00' })).toBeEnabled();
  });

  test('fía en cuotas solo los productos que las admiten', async ({ page }) => {
    test.setTimeout(150_000);
    await registerOwnerWithStore(page);
    await addProduct(page, 'Cocina a gas', '400', '3', { creditPrice: '450', installments: true });
    await addCreditNeighbor(page, 'Juana', '1000');

    await page.goto('./sales');
    await page.getByRole('combobox', { name: 'Vecino' }).fill('juana');
    await page.getByRole('option', { name: /Juana Quispe/ }).click();
    await page.getByRole('button', { name: /^Cocina a gas/ }).click();

    const panel = await cart(page);
    await panel.getByText('En cuotas', { exact: true }).click();
    await panel.getByLabel('Número de cuotas').selectOption('3');
    await expect(panel.getByText(/Cuota mensual \(la primera el/)).toBeVisible();
    await expectAccessible(page);
    await panel.getByRole('button', { name: 'Fiar S/ 450.00' }).click();
    await expect(page.getByText('Fiado registrado · S/ 450.00')).toBeVisible();
    await expect(page.getByText(/Juana Quispe · 3 cuotas de S\/ /)).toBeVisible();
  });
});
