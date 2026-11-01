import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProductUseCase } from '@/core/application/catalog/manage-catalog';
import {
  RegisterCashSaleUseCase,
  type RegisterCashSaleCommand,
} from '@/core/application/sales/register-cash-sale';
import { FakeImageStorage, InMemoryCatalog } from '../../fakes/in-memory-catalog';
import { InMemorySales } from '../../fakes/in-memory-sales';

const STORE = 'store-1';
const NOW = new Date('2026-11-02T15:00:00Z');

let catalog: InMemoryCatalog;
let sales: InMemorySales;
let arroz: string;

async function product(name: string, stock: string, cash: string, credit: string) {
  const unitId = catalog.unitsByStore.get(STORE)![0]!.id;
  const result = await new CreateProductUseCase(catalog, new FakeImageStorage()).execute({
    storeId: STORE,
    actorId: 'owner-1',
    details: {
      name,
      description: '',
      brand: '',
      sku: '',
      barcode: '',
      unitId,
      isService: false,
      allowsInstallments: false,
    },
    cashPrice: cash,
    creditPrice: credit,
    minimumStock: '',
    initialStock: stock,
    image: null,
    now: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const sell = (overrides: Partial<RegisterCashSaleCommand> = {}) =>
  new RegisterCashSaleUseCase(sales).execute({
    storeId: STORE,
    cashierId: 'employee-1',
    customerId: null,
    cart: [{ productId: arroz, quantity: '3' }],
    paymentMethod: 'CASH',
    amountReceived: '20',
    now: NOW,
    ...overrides,
  });

beforeEach(async () => {
  catalog = new InMemoryCatalog();
  catalog.seedUnits(STORE);
  sales = new InMemorySales(catalog);
  arroz = await product('Arroz Costeño', '10', '4.50', '5.00');
});

describe('RegisterCashSaleUseCase (US07)', () => {
  it('vende a un cliente anónimo al precio de contado y entrega el vuelto (crit. 1-3)', async () => {
    const result = await sell();
    expect(result).toEqual({
      ok: true,
      value: { saleId: 's-1', total: '13.50', changeGiven: '6.50' },
    });
    expect(sales.sales.get('s-1')).toMatchObject({ customerId: null, cashierId: 'employee-1' });
  });

  it('descuenta el stock con una salida en el kardex (crit. 5)', async () => {
    await sell();
    expect(catalog.products.get(arroz)!.stock).toBe('7.000');
    expect(catalog.movements.at(-1)).toEqual({ productId: arroz, quantity: '-3.000', notes: null });
  });

  it('registra Yape, Plin y tarjeta sin vuelto (crit. 4)', async () => {
    const result = await sell({ paymentMethod: 'YAPE', amountReceived: '' });
    expect(result.ok && result.value.changeGiven).toBeNull();
    expect(sales.sales.get('s-1')).toMatchObject({
      modality: 'CASH',
      settlement: { payment: { method: 'YAPE' } },
    });
  });

  it('sin stock suficiente no vende nada ni toca el stock (crit. 6)', async () => {
    const fideos = await product('Fideos Don Vittorio', '1', '3.00', '3.20');
    const result = await sell({
      cart: [
        { productId: arroz, quantity: '2' },
        { productId: fideos, quantity: '2' },
      ],
    });
    expect(result.ok ? null : result.error).toMatchObject({
      code: 'OUT_OF_STOCK',
      productName: 'Fideos Don Vittorio',
    });
    expect(catalog.products.get(arroz)!.stock).toBe('10.000');
    expect(sales.sales.size).toBe(0);
  });

  it('rechaza un efectivo menor que el total', async () => {
    expect(await sell({ amountReceived: '10' })).toEqual({
      ok: false,
      error: { code: 'RECEIVED_TOO_LOW' },
    });
  });

  it('asocia al vecino si se elige uno, y rechaza uno que no existe', async () => {
    sales.customers.add('c-1');
    expect((await sell({ customerId: 'c-1' })).ok).toBe(true);
    expect(await sell({ customerId: 'c-9' })).toEqual({
      ok: false,
      error: { code: 'CUSTOMER_NOT_FOUND' },
    });
  });

  it('las ventas no cambian si después sube el precio (US03 crit. 5)', async () => {
    await sell();
    catalog.products.get(arroz)!.prices = { cash: '6.00', credit: '6.50' };
    const sold = sales.sales.get('s-1')!.settlement.priced;
    expect(sold.lines[0]!.unitPrice.toFixed2()).toBe('4.50');
    expect(sold.total.toFixed2()).toBe('13.50');
  });
});
