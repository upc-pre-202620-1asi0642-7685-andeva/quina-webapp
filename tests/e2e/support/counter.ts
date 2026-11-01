import { expect, type Page } from '@playwright/test';
import { uniqueDni, uniqueEmail } from './flows';

export async function addProduct(
  page: Page,
  name: string,
  cashPrice: string,
  stock: string,
  options: { creditPrice?: string; installments?: boolean } = {},
) {
  await page.goto('./inventory/new');
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  if (options.installments) {
    await page.getByRole('checkbox', { name: 'Se puede fiar en cuotas' }).check();
  }
  await page.getByLabel('Precio al contado').fill(cashPrice);
  await page.getByLabel('Precio al fiado').fill(options.creditPrice ?? cashPrice);
  await page.getByLabel('Stock inicial').fill(stock);
  await page.getByRole('button', { name: 'Registrar producto' }).click();
  await expect(page.getByText(`Registramos ${name}`)).toBeVisible();
}

/** Vecino con fiado abierto: límite en soles y tasas debajo del tope del BCRP. */
export async function addCreditNeighbor(page: Page, firstName: string, limit: string) {
  const dni = uniqueDni();
  const email = uniqueEmail('vecina');
  await page.goto('./customers/new');
  await page.getByLabel('Número de documento').fill(dni);
  await page.getByLabel('Nombres', { exact: true }).fill(firstName);
  await page.getByLabel('Apellidos').fill('Quispe');
  await page.getByLabel('Celular').fill('987654321');
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByRole('checkbox', { name: /El vecino autoriza/ }).check();
  await page.getByRole('button', { name: 'Registrar vecino' }).click();
  await expect(page).toHaveURL(/\/terms\?new=1/);
  await page.getByLabel('Límite de fiado').fill(limit);
  const rates = page.getByLabel('Tasa (%)');
  await rates.nth(0).fill('20');
  await rates.nth(1).fill('15');
  await page.getByRole('button', { name: 'Abrir fiado' }).click();
  await expect(page.getByText(`Listo: ${firstName} ya puede comprar al fiado.`)).toBeVisible();
  return { dni, email };
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** En el celular el carrito vive en una hoja; en escritorio, en la columna derecha. */
export async function cart(page: Page) {
  if (isMobile(page)) {
    await page.getByRole('button', { name: /^Carrito ·/ }).click();
    return page.getByRole('dialog', { name: 'Carrito' });
  }
  return page.getByRole('complementary', { name: 'Carrito' });
}

/**
 * Botón de cobrar o fiar sin abrir nada más: la barra inferior en el celular y
 * la columna del carrito en escritorio (D7).
 */
export function chargeButton(page: Page, name: string | RegExp) {
  const scope = isMobile(page) ? page : page.getByRole('complementary', { name: 'Carrito' });
  return scope.getByRole('button', { name });
}
