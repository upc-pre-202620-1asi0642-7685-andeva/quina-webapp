import { describe, expect, it } from 'vitest';
import { parseProductDetails } from '@/core/domain/catalog/product-details';
import { MAX_IMAGE_BYTES, ProductImage } from '@/core/domain/catalog/product-image';
import { ProductPrices } from '@/core/domain/catalog/product-prices';
import { Quantity } from '@/core/domain/catalog/quantity';

const details = {
  name: '  Leche   Gloria  ',
  description: '',
  brand: 'Gloria',
  sku: '',
  barcode: '7751271000000',
  unitId: 'u-1',
  isService: false,
  allowsInstallments: false,
};

describe('precios del catálogo (US03 crit. 1 y 6)', () => {
  it('acepta contado y crédito en soles, con o sin "S/"', () => {
    const prices = ProductPrices.parse('S/ 4.50', '5');
    expect(prices.ok && prices.value.cash.toFixed2()).toBe('4.50');
    expect(prices.ok && prices.value.credit.toFixed2()).toBe('5.00');
  });

  it('rechaza un precio al crédito menor que el de contado', () => {
    expect(ProductPrices.parse('5.00', '4.99')).toEqual({ ok: false, error: 'CREDIT_BELOW_CASH' });
  });

  it('acepta crédito igual al contado', () => {
    expect(ProductPrices.parse('3', '3.00').ok).toBe(true);
  });

  it('rechaza precios en cero, negativos o con 3 decimales', () => {
    expect(ProductPrices.parse('0', '1')).toEqual({ ok: false, error: 'CASH_PRICE_INVALID' });
    expect(ProductPrices.parse('-1', '1')).toEqual({ ok: false, error: 'CASH_PRICE_INVALID' });
    expect(ProductPrices.parse('1', '1.005')).toEqual({ ok: false, error: 'CREDIT_PRICE_INVALID' });
  });

  it('detecta si cambió alguno de los dos precios', () => {
    const a = ProductPrices.parse('1', '2');
    const b = ProductPrices.parse('1.00', '2.00');
    const c = ProductPrices.parse('1', '2.10');
    if (!a.ok || !b.ok || !c.ok) throw new Error('precios de prueba inválidos');
    expect(ProductPrices.changed(a.value, b.value)).toBe(false);
    expect(ProductPrices.changed(a.value, c.value)).toBe(true);
  });
});

describe('cantidades por unidad (D12)', () => {
  it('exige enteros si la unidad no admite decimales', () => {
    expect(Quantity.parse('2', { allowDecimals: false })).toEqual({ ok: true, value: '2.000' });
    expect(Quantity.parse('1.5', { allowDecimals: false })).toEqual({
      ok: false,
      error: 'QUANTITY_NOT_WHOLE',
    });
  });

  it('admite hasta 3 decimales a granel y coma decimal', () => {
    expect(Quantity.parse('0,25', { allowDecimals: true })).toEqual({ ok: true, value: '0.250' });
    expect(Quantity.parse('1.2345', { allowDecimals: true })).toEqual({
      ok: false,
      error: 'QUANTITY_INVALID',
    });
  });

  it('el cero solo vale cuando se permite (stock), no en una venta', () => {
    expect(Quantity.parse('0', { allowDecimals: false }).ok).toBe(false);
    expect(Quantity.parse('0', { allowDecimals: false, allowZero: true }).ok).toBe(true);
  });

  it('resta con 3 decimales para el ajuste de conteo', () => {
    expect(Quantity.minus('3.000', '5.500')).toBe('-2.500');
  });
});

describe('ficha del producto (US03 crit. 1 y 2)', () => {
  it('limpia espacios y deja vacíos en null', () => {
    const parsed = parseProductDetails(details);
    expect(parsed.ok && parsed.value).toMatchObject({
      name: 'Leche Gloria',
      description: null,
      sku: null,
      barcode: '7751271000000',
    });
  });

  it('exige nombre y unidad', () => {
    expect(parseProductDetails({ ...details, name: ' ' })).toEqual({
      ok: false,
      error: 'NAME_REQUIRED',
    });
    expect(parseProductDetails({ ...details, unitId: '' })).toEqual({
      ok: false,
      error: 'UNIT_REQUIRED',
    });
  });

  it('el código de barras son solo dígitos', () => {
    expect(parseProductDetails({ ...details, barcode: '77-51' })).toEqual({
      ok: false,
      error: 'BARCODE_INVALID',
    });
  });
});

describe('imagen del producto (US03 crit. 3)', () => {
  it('acepta JPG, PNG y WEBP hasta 2 MB', () => {
    const image = ProductImage.parse('image/webp', new Uint8Array(10));
    expect(image.ok && image.value.extension).toBe('webp');
  });

  it('rechaza otros tipos y archivos grandes', () => {
    expect(ProductImage.parse('image/gif', new Uint8Array(10))).toEqual({
      ok: false,
      error: 'IMAGE_TYPE',
    });
    expect(ProductImage.parse('image/png', new Uint8Array(MAX_IMAGE_BYTES + 1))).toEqual({
      ok: false,
      error: 'IMAGE_TOO_LARGE',
    });
  });
});
