import { describe, expect, it } from 'vitest';
import { settleCashPayment } from '@/core/domain/sales/cash-payment';
import { mergeCart, priceSale, type SaleProduct } from '@/core/domain/sales/sale-pricing';
import { Money } from '@/core/domain/shared/money';

const leche: SaleProduct = {
  id: 'leche',
  name: 'Leche Gloria',
  isService: false,
  isActive: true,
  allowDecimals: false,
  allowsInstallments: false,
  currentStock: '10.000',
  cashPrice: '4.20',
  creditPrice: '4.50',
  currentAverageCost: '3.1000',
};
const azucar: SaleProduct = {
  ...leche,
  id: 'azucar',
  name: 'Azúcar rubia',
  allowDecimals: true,
  currentStock: '2.500',
  cashPrice: '3.80',
  creditPrice: '4.00',
  currentAverageCost: '2.9000',
};
const recarga: SaleProduct = {
  ...leche,
  id: 'recarga',
  name: 'Recarga',
  isService: true,
  currentStock: '0.000',
  cashPrice: '10.00',
  creditPrice: '10.00',
  currentAverageCost: '0.0000',
};
const products = [leche, azucar, recarga];

describe('priceSale (US07, US08)', () => {
  it('al contado usa el precio de contado y descuenta el stock (US07 crit. 2 y 5)', () => {
    const sale = priceSale([{ productId: 'leche', quantity: '2' }], products, 'CASH');
    expect(sale.ok).toBe(true);
    if (!sale.ok) return;
    expect(sale.value.total.toFixed2()).toBe('8.40');
    expect(sale.value.lines[0]).toMatchObject({ quantity: '2.000', stockAfter: '8.000' });
    expect(sale.value.lines[0]!.unitPrice.toFixed2()).toBe('4.20');
  });

  it('al fiado usa el precio de crédito (US08 crit. 4)', () => {
    const sale = priceSale([{ productId: 'leche', quantity: '2' }], products, 'CREDIT');
    expect(sale.ok && sale.value.total.toFixed2()).toBe('9.00');
  });

  it('congela el costo promedio y calcula la ganancia (US08 crit. 6)', () => {
    const sale = priceSale([{ productId: 'leche', quantity: '2' }], products, 'CASH');
    if (!sale.ok) throw new Error('venta de prueba inválida');
    expect(sale.value.lines[0]!.unitCost).toBe('3.1000');
    expect(sale.value.totalCost.toFixed2()).toBe('6.20');
    expect(sale.value.profit.toFixed2()).toBe('2.20');
  });

  it('a granel multiplica y redondea a céntimos', () => {
    const sale = priceSale([{ productId: 'azucar', quantity: '0.75' }], products, 'CASH');
    // 0.75 × 3.80 = 2.85
    expect(sale.ok && sale.value.total.toFixed2()).toBe('2.85');
    const odd = priceSale([{ productId: 'azucar', quantity: '0.333' }], products, 'CASH');
    // 0.333 × 3.80 = 1.2654 → 1.27
    expect(odd.ok && odd.value.total.toFixed2()).toBe('1.27');
  });

  it('un servicio no toca el stock', () => {
    const sale = priceSale([{ productId: 'recarga', quantity: '3' }], products, 'CASH');
    expect(sale.ok && sale.value.lines[0]!.stockAfter).toBeNull();
    expect(sale.ok && sale.value.total.toFixed2()).toBe('30.00');
  });

  it('sin stock suficiente rechaza toda la venta y dice qué producto (US07 crit. 6)', () => {
    const sale = priceSale(
      [
        { productId: 'leche', quantity: '1' },
        { productId: 'azucar', quantity: '3' },
      ],
      products,
      'CASH',
    );
    expect(sale).toEqual({
      ok: false,
      error: {
        code: 'OUT_OF_STOCK',
        productId: 'azucar',
        productName: 'Azúcar rubia',
        available: '2.500',
      },
    });
  });

  it('suma las líneas repetidas antes de revisar el stock', () => {
    const sale = priceSale(
      [
        { productId: 'leche', quantity: '6' },
        { productId: 'leche', quantity: '5' },
      ],
      products,
      'CASH',
    );
    expect(sale.ok).toBe(false);
    expect(
      mergeCart([
        { productId: 'a', quantity: '1.000' },
        { productId: 'a', quantity: '2.500' },
      ]),
    ).toEqual([{ productId: 'a', quantity: '3.500' }]);
  });

  it('exige enteros en productos por unidad', () => {
    const sale = priceSale([{ productId: 'leche', quantity: '1.5' }], products, 'CASH');
    expect(sale.ok ? null : sale.error.code).toBe('QUANTITY_INVALID');
  });

  it('rechaza carrito vacío, cantidades raras y productos de baja', () => {
    expect(priceSale([], products, 'CASH')).toEqual({ ok: false, error: { code: 'EMPTY_CART' } });
    const zero = priceSale([{ productId: 'leche', quantity: '0' }], products, 'CASH');
    expect(zero.ok ? null : zero.error.code).toBe('QUANTITY_INVALID');
    const junk = priceSale([{ productId: 'leche', quantity: 'dos' }], products, 'CASH');
    expect(junk.ok ? null : junk.error.code).toBe('QUANTITY_INVALID');
    const off = priceSale(
      [{ productId: 'leche', quantity: '1' }],
      [{ ...leche, isActive: false }],
      'CASH',
    );
    expect(off).toEqual({ ok: false, error: { code: 'PRODUCT_UNAVAILABLE', productId: 'leche' } });
  });
});

describe('settleCashPayment (US07 crit. 3 y 4)', () => {
  const total = Money.of('27.60', 'PEN');

  it('calcula el vuelto en efectivo', () => {
    const payment = settleCashPayment(total, 'CASH', '50');
    expect(payment.ok && payment.value.changeGiven?.toFixed2()).toBe('22.40');
    expect(payment.ok && payment.value.amountReceived?.toFixed2()).toBe('50.00');
  });

  it('rechaza recibir menos que el total', () => {
    expect(settleCashPayment(total, 'CASH', '20')).toEqual({
      ok: false,
      error: 'RECEIVED_TOO_LOW',
    });
  });

  it('sin monto recibido vale como pago exacto', () => {
    expect(settleCashPayment(total, 'CASH', '')).toEqual({
      ok: true,
      value: { method: 'CASH', amountReceived: null, changeGiven: null },
    });
  });

  it('Yape, Plin y tarjeta no llevan vuelto aunque se escriba un monto', () => {
    for (const method of ['YAPE', 'PLIN', 'CARD'] as const) {
      const payment = settleCashPayment(total, method, '100');
      expect(payment.ok && payment.value).toEqual({
        method,
        amountReceived: null,
        changeGiven: null,
      });
    }
  });
});
