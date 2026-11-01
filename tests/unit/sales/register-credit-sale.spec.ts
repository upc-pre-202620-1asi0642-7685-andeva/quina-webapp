import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProductUseCase } from '@/core/application/catalog/manage-catalog';
import {
  RegisterCreditSaleUseCase,
  type RegisterCreditSaleCommand,
} from '@/core/application/sales/register-credit-sale';
import type { CreditAccountSnapshot } from '@/core/domain/sales/credit-sale';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { FakeImageStorage, InMemoryCatalog } from '../../fakes/in-memory-catalog';
import { InMemorySales } from '../../fakes/in-memory-sales';

const STORE = 'store-1';
// 2 de noviembre, 10:00 de Lima
const NOW = new Date('2026-11-02T15:00:00Z');

let catalog: InMemoryCatalog;
let sales: InMemorySales;
let arroz: string;
let cocina: string;

async function product(name: string, stock: string, cash: string, credit: string, cuotas = false) {
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
      allowsInstallments: cuotas,
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

function account(overrides: Partial<CreditAccountSnapshot> = {}): CreditAccountSnapshot {
  return {
    id: 'account-1',
    customerActive: true,
    status: 'ACTIVE',
    currentBalance: '50.00',
    hasOverdueCycle: false,
    terms: {
      currency: 'PEN',
      creditLimit: '200.00',
      compensatory: { type: 'EFFECTIVE', value: '0.0300', period: 'MONTHLY', capitalization: null },
      moratory: { type: 'EFFECTIVE', value: '0.0010', period: 'DAILY', capitalization: null },
      cutOffDay: 20,
      paymentDueDay: 26,
      maxInstallmentMonths: 6,
    },
    ...overrides,
  };
}

const sell = (overrides: Partial<RegisterCreditSaleCommand> = {}) =>
  new RegisterCreditSaleUseCase(sales).execute({
    storeId: STORE,
    cashierId: 'employee-1',
    customerId: 'vecino-1',
    cart: [{ productId: arroz, quantity: '3' }],
    plan: { mode: 'SINGLE' },
    now: NOW,
    ...overrides,
  });

beforeEach(async () => {
  catalog = new InMemoryCatalog();
  catalog.seedUnits(STORE);
  sales = new InMemorySales(catalog);
  sales.accounts.set('vecino-1', account());
  arroz = await product('Arroz Costeño', '10', '4.50', '5.00');
  cocina = await product('Cocina a gas', '2', '400.00', '450.00', true);
});

describe('RegisterCreditSaleUseCase (US08)', () => {
  it('fía al precio de crédito y suma el capital a la deuda (crit. 4)', async () => {
    const result = await sell();
    expect(result).toEqual({
      ok: true,
      value: {
        saleId: 's-1',
        total: '15.00',
        balanceAfter: '65.00',
        availableAfter: '135.00',
        installments: null,
      },
    });
    expect(sales.accounts.get('vecino-1')!.currentBalance).toBe('65.00');
    expect(catalog.products.get(arroz)!.stock).toBe('7.000');
  });

  it('asigna el cargo al ciclo según el día de corte en Lima (crit. 7)', async () => {
    await sell();
    // 21 de noviembre en Lima: ya pasó el corte del 20, va al ciclo de diciembre
    await sell({ now: new Date('2026-11-21T15:00:00Z') });
    const cycles = [...sales.sales.values()].map((s) =>
      s.modality === 'CREDIT'
        ? [s.settlement.cycle.periodYear, s.settlement.cycle.periodMonth]
        : null,
    );
    expect(cycles).toEqual([
      [2026, 11],
      [2026, 12],
    ]);
  });

  it('bloquea el exceso con el monto exacto (crit. 2)', async () => {
    sales.accounts.set('vecino-1', account({ currentBalance: '190.00' }));
    expect(await sell()).toEqual({
      ok: false,
      error: { code: 'EXCEEDS_AVAILABLE', excess: '5.00', available: '10.00' },
    });
    expect(catalog.products.get(arroz)!.stock).toBe('10.000');
  });

  it('cancela todo si un producto no alcanza y lo nombra (crit. 3)', async () => {
    const result = await sell({ cart: [{ productId: arroz, quantity: '11' }] });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'OUT_OF_STOCK', productName: 'Arroz Costeño' }),
    });
    expect(sales.sales.size).toBe(0);
  });

  it('bloquea el fiado con un ciclo vencido (crit. 8)', async () => {
    sales.accounts.set('vecino-1', account({ hasOverdueCycle: true }));
    expect(await sell()).toEqual({ ok: false, error: { code: 'ACCOUNT_OVERDUE' } });
  });

  it.each([
    [{ status: 'SUSPENDED' as const }, 'ACCOUNT_SUSPENDED'],
    [{ status: 'BLOCKED' as const }, 'ACCOUNT_BLOCKED'],
    [{ customerActive: false }, 'CUSTOMER_INACTIVE'],
  ])('bloquea una cuenta que no está al día (D9) %#', async (overrides, code) => {
    sales.accounts.set('vecino-1', account(overrides));
    expect(await sell()).toEqual({ ok: false, error: { code } });
  });

  it('bloquea la cuenta en dólares con aviso (D4)', async () => {
    const usd = account();
    sales.accounts.set('vecino-1', { ...usd, terms: { ...usd.terms, currency: 'USD' } });
    expect(await sell()).toEqual({ ok: false, error: { code: 'USD_ACCOUNT' } });
  });

  it('rechaza al vecino sin cuenta de fiado', async () => {
    expect(await sell({ customerId: 'vecino-2' })).toEqual({
      ok: false,
      error: { code: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('rechaza un ciclo ya liquidado (D8)', async () => {
    sales.closedCycles.add('account-1:2026-11');
    expect(await sell()).toEqual({ ok: false, error: { code: 'CYCLE_CLOSED' } });
  });

  describe('en cuotas (D3)', () => {
    beforeEach(() => {
      sales.accounts.set(
        'vecino-1',
        account({ currentBalance: '0.00', terms: { ...account().terms, creditLimit: '1000.00' } }),
      );
    });

    it('arma el cronograma francés y el límite consume solo el capital', async () => {
      const result = await sell({
        cart: [{ productId: cocina, quantity: '1' }],
        plan: { mode: 'INSTALLMENTS', count: 3 },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({
        total: '450.00',
        balanceAfter: '450.00',
        availableAfter: '550.00',
      });
      expect(result.value.installments?.count).toBe(3);
      const sale = sales.sales.get(result.value.saleId)!;
      if (sale.modality !== 'CREDIT') throw new Error('se esperaba fiado');
      const plan = sale.settlement.installments!;
      // Gracia del 2 al 26 de noviembre en 30/360; la primera cuota vence el 26 de diciembre
      expect(plan.graceDays).toBe(24);
      expect(plan.rows[0]!.dueDate).toEqual(BusinessDate.of(2026, 12, 26));
      expect(plan.capitalizedAmount.compare(plan.rows[0]!.initialBalance)).toBe(0);
    });

    it('no ofrece cuotas si algún producto no las admite', async () => {
      expect(
        await sell({
          cart: [
            { productId: cocina, quantity: '1' },
            { productId: arroz, quantity: '1' },
          ],
          plan: { mode: 'INSTALLMENTS', count: 3 },
        }),
      ).toEqual({ ok: false, error: { code: 'INSTALLMENTS_NOT_ALLOWED' } });
    });

    it('respeta el máximo de meses pactado con el vecino', async () => {
      expect(
        await sell({
          cart: [{ productId: cocina, quantity: '1' }],
          plan: { mode: 'INSTALLMENTS', count: 7 },
        }),
      ).toEqual({ ok: false, error: { code: 'EXCEEDS_MAX_INSTALLMENT_MONTHS', max: 6 } });
    });
  });
});
