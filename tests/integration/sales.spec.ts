import { randomInt, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { CreateProductUseCase } from '@/core/application/catalog/manage-catalog';
import {
  RegisterCashSaleUseCase,
  type RegisterCashSaleCommand,
} from '@/core/application/sales/register-cash-sale';
import { RegisterCreditSaleUseCase } from '@/core/application/sales/register-credit-sale';
import { closeDb, db } from '@/infrastructure/db/connection';
import { loadTodayCashBox } from '@/infrastructure/db/queries/sales';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { DrizzleSaleRepository } from '@/infrastructure/db/repositories/drizzle-sale-repository';
import { BASE_UNITS } from '@/infrastructure/db/repositories/drizzle-store-registration-repository';
import {
  creditAccounts,
  creditCharges,
  creditInstallments,
  customers,
  inventoryMovements,
  products,
  saleItems,
  sales,
  settlementCycles,
  stores,
  storeSubscriptions,
  units,
  users,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { FakeImageStorage } from '../fakes/in-memory-catalog';

afterAll(async () => {
  await closeDb();
});

const NOW = new Date('2026-11-15T15:00:00Z');
const productRepo = new DrizzleProductRepository();
const sell = new RegisterCashSaleUseCase(new DrizzleSaleRepository());

async function storeWithOwner() {
  const suffix = randomUUID().replaceAll('-', '');
  const [store] = await db
    .insert(stores)
    .values({
      commercialName: `Bodega ${suffix.slice(0, 6)}`,
      businessTurn: 'BODEGA',
      taxIdType: 'RUC',
      taxIdNumber: `20${String(randomInt(1e9)).padStart(9, '0')}`,
      ownerFullName: 'Lucho Pérez',
      contactEmail: `${suffix}@store.test`,
    })
    .returning({ id: stores.id });
  const storeId = store!.id;
  await withTenant(storeId, async (tx) => {
    await tx.insert(storeSubscriptions).values({ storeId, planTier: 'CASERO', status: 'ACTIVE' });
    await tx.insert(units).values(BASE_UNITS.map((unit) => ({ ...unit, storeId })));
  });
  const [owner] = await db
    .insert(users)
    .values({
      name: 'Lucho Pérez',
      email: `owner-${suffix}@store.test`,
      emailVerified: true,
      role: 'STORE_OWNER',
      storeId,
    })
    .returning({ id: users.id });
  const unitList = await productRepo.units(storeId);
  return { storeId, ownerId: owner!.id, und: unitList.find((u) => u.code === 'UND')!.id };
}

type Ctx = Awaited<ReturnType<typeof storeWithOwner>>;

async function product(
  ctx: Ctx,
  overrides: {
    name?: string;
    cashPrice?: string;
    initialStock?: string;
    isService?: boolean;
    allowsInstallments?: boolean;
  } = {},
) {
  const result = await new CreateProductUseCase(productRepo, new FakeImageStorage()).execute({
    storeId: ctx.storeId,
    actorId: ctx.ownerId,
    details: {
      name: overrides.name ?? 'Leche Gloria azul',
      description: '',
      brand: '',
      sku: '',
      barcode: '',
      unitId: ctx.und,
      isService: overrides.isService ?? false,
      allowsInstallments: overrides.allowsInstallments ?? false,
    },
    cashPrice: overrides.cashPrice ?? '4.20',
    creditPrice: overrides.cashPrice ?? '4.50',
    minimumStock: '0',
    initialStock: overrides.isService ? '' : (overrides.initialStock ?? '10'),
    image: null,
    now: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function sale(ctx: Ctx, overrides: Partial<RegisterCashSaleCommand> = {}): RegisterCashSaleCommand {
  return {
    storeId: ctx.storeId,
    cashierId: ctx.ownerId,
    customerId: null,
    cart: [],
    paymentMethod: 'CASH',
    amountReceived: '',
    now: NOW,
    ...overrides,
  };
}

const stockOf = (ctx: Ctx, productId: string) =>
  withTenant(ctx.storeId, async (tx) => {
    const [row] = await tx
      .select({ stock: products.currentStock })
      .from(products)
      .where(eq(products.id, productId));
    return row!.stock;
  });

describe('venta al contado en PostgreSQL (US07)', () => {
  it('asienta venta, ítems, vuelto y salida del kardex en una transacción', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const result = await sell.execute(
      sale(ctx, { cart: [{ productId: milk, quantity: '3' }], amountReceived: '20' }),
    );
    expect(result).toEqual({
      ok: true,
      value: { saleId: expect.any(String), total: '12.60', changeGiven: '7.40' },
    });
    if (!result.ok) return;

    const [saleRows, items, exits] = await withTenant(ctx.storeId, async (tx) => [
      await tx.select().from(sales).where(eq(sales.id, result.value.saleId)),
      await tx.select().from(saleItems).where(eq(saleItems.saleId, result.value.saleId)),
      await tx
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.referenceId, result.value.saleId)),
    ]);
    expect(saleRows[0]).toMatchObject({
      saleModality: 'CASH',
      paymentMethod: 'CASH',
      userIdCashier: ctx.ownerId,
      totalAmount: '12.60',
      amountReceived: '20.00',
      changeGiven: '7.40',
    });
    expect(items).toEqual([
      expect.objectContaining({
        productId: milk,
        quantity: '3.000',
        unitPrice: '4.20',
        subtotal: '12.60',
      }),
    ]);
    // D14: salida negativa con la venta como origen y el cajero de la sesión
    expect(exits).toEqual([
      expect.objectContaining({
        movementType: 'SALE_EXIT',
        quantity: '-3.000',
        stockAfter: '7.000',
        userId: ctx.ownerId,
      }),
    ]);
    expect(await stockOf(ctx, milk)).toBe('7.000');
  });

  it('sin stock suficiente no deja nada a medias (crit. 6)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx, { initialStock: '2' });
    const bread = await product(ctx, { name: 'Pan francés', cashPrice: '0.30' });
    const result = await sell.execute(
      sale(ctx, {
        cart: [
          { productId: bread, quantity: '5' },
          { productId: milk, quantity: '3' },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'OUT_OF_STOCK',
        productId: milk,
        productName: 'Leche Gloria azul',
        available: '2.000',
      },
    });
    const saleRows = await withTenant(ctx.storeId, (tx) =>
      tx.select().from(sales).where(eq(sales.storeId, ctx.storeId)),
    );
    expect(saleRows).toHaveLength(0);
    expect(await stockOf(ctx, bread)).toBe('10.000');
    expect(await stockOf(ctx, milk)).toBe('2.000');
  });

  it('dos cajas que venden la última unidad a la vez: solo una la cobra', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx, { initialStock: '1' });
    const attempt = () => sell.execute(sale(ctx, { cart: [{ productId: milk, quantity: '1' }] }));
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      expect.objectContaining({ error: expect.objectContaining({ code: 'OUT_OF_STOCK' }) }),
    ]);
    expect(await stockOf(ctx, milk)).toBe('0.000');
  });

  it('los servicios se cobran sin tocar stock ni kardex', async () => {
    const ctx = await storeWithOwner();
    const recharge = await product(ctx, { name: 'Recarga', cashPrice: '10.00', isService: true });
    const result = await sell.execute(
      sale(ctx, { cart: [{ productId: recharge, quantity: '1' }], paymentMethod: 'YAPE' }),
    );
    expect(result.ok).toBe(true);
    const movements = await withTenant(ctx.storeId, (tx) =>
      tx.select().from(inventoryMovements).where(eq(inventoryMovements.productId, recharge)),
    );
    expect(movements).toHaveLength(0);
  });

  it('la venta y sus ítems no se pueden editar ni borrar', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const result = await sell.execute(sale(ctx, { cart: [{ productId: milk, quantity: '1' }] }));
    if (!result.ok) throw new Error('venta fallida');
    await expect(
      withTenant(ctx.storeId, (tx) =>
        tx.update(sales).set({ notes: 'cambiado' }).where(eq(sales.id, result.value.saleId)),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(ctx.storeId, (tx) =>
        tx.delete(saleItems).where(eq(saleItems.saleId, result.value.saleId)),
      ),
    ).rejects.toThrow();
  });

  it('otra tienda no puede vender el producto ajeno (RLS)', async () => {
    const ctx = await storeWithOwner();
    const other = await storeWithOwner();
    const milk = await product(ctx);
    const result = await sell.execute(sale(other, { cart: [{ productId: milk, quantity: '1' }] }));
    expect(result).toEqual({ ok: false, error: { code: 'PRODUCT_UNAVAILABLE', productId: milk } });
    expect(await stockOf(ctx, milk)).toBe('10.000');
  });

  it('la caja de hoy suma el contado del día de Lima por medio de pago (D6)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    await sell.execute(sale(ctx, { cart: [{ productId: milk, quantity: '2' }] }));
    await sell.execute(
      sale(ctx, { cart: [{ productId: milk, quantity: '1' }], paymentMethod: 'YAPE' }),
    );
    // 23:30 de Lima del día anterior: no entra en la caja de hoy
    await sell.execute(
      sale(ctx, {
        cart: [{ productId: milk, quantity: '1' }],
        now: new Date('2026-11-15T04:30:00Z'),
      }),
    );
    const box = await loadTodayCashBox(ctx.storeId, NOW);
    expect(box.total).toBe('12.60');
    expect(box.count).toBe(2);
    expect(box.byMethod).toEqual([
      { method: 'CASH', total: '8.40', count: 1 },
      { method: 'YAPE', total: '4.20', count: 1 },
      { method: 'PLIN', total: '0.00', count: 0 },
      { method: 'CARD', total: '0.00', count: 0 },
    ]);
  });
});

const fiar = new RegisterCreditSaleUseCase(new DrizzleSaleRepository());

/** Vecino con cuenta de fiado: límite S/ 200, corte 20 y pago 26, 3 % mensual. */
async function neighbor(
  ctx: Ctx,
  overrides: { creditLimit?: string; maxInstallmentMonths?: number } = {},
) {
  const dni = String(randomInt(1e8)).padStart(8, '0');
  return withTenant(ctx.storeId, async (tx) => {
    const [customer] = await tx
      .insert(customers)
      .values({
        storeId: ctx.storeId,
        documentType: 'DNI',
        documentNumber: dni,
        firstName: 'Rosa',
        lastName: 'Quispe',
        email: `rosa-${dni}@example.com`,
      })
      .returning({ id: customers.id });
    const [account] = await tx
      .insert(creditAccounts)
      .values({
        storeId: ctx.storeId,
        customerId: customer!.id,
        creditLimit: overrides.creditLimit ?? '200.00',
        compensatoryRateType: 'EFFECTIVE',
        compensatoryRateValue: '0.0300',
        compensatoryPeriod: 'MONTHLY',
        moratoryRateType: 'EFFECTIVE',
        moratoryRateValue: '0.0010',
        moratoryPeriod: 'DAILY',
        maxInstallmentMonths: overrides.maxInstallmentMonths ?? 6,
        cutOffDay: 20,
        paymentDueDay: 26,
      })
      .returning({ id: creditAccounts.id });
    return { customerId: customer!.id, accountId: account!.id };
  });
}

const accountOf = (ctx: Ctx, accountId: string) =>
  withTenant(ctx.storeId, async (tx) => {
    const [row] = await tx.select().from(creditAccounts).where(eq(creditAccounts.id, accountId));
    return row!;
  });

describe('venta al fiado en PostgreSQL (US08)', () => {
  it('crea venta, ciclo abierto y cargo con copia de tasas, y suma la deuda (crit. 4 y 7)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    const command = {
      storeId: ctx.storeId,
      cashierId: ctx.ownerId,
      customerId: rosa.customerId,
      cart: [{ productId: milk, quantity: '2' }],
      plan: { mode: 'SINGLE' as const },
      now: NOW,
    };
    const first = await fiar.execute(command);
    expect(first).toEqual({
      ok: true,
      value: expect.objectContaining({
        total: '9.00',
        balanceAfter: '9.00',
        availableAfter: '191.00',
      }),
    });
    // La segunda compra del mismo ciclo reutiliza el ciclo abierto
    const second = await fiar.execute(command);
    expect(second.ok).toBe(true);
    if (!first.ok) return;

    const [saleRows, cycles, charges] = await withTenant(ctx.storeId, async (tx) => [
      await tx.select().from(sales).where(eq(sales.id, first.value.saleId)),
      await tx
        .select()
        .from(settlementCycles)
        .where(eq(settlementCycles.creditAccountId, rosa.accountId)),
      await tx
        .select()
        .from(creditCharges)
        .where(eq(creditCharges.creditAccountId, rosa.accountId)),
    ]);
    expect(saleRows[0]).toMatchObject({
      saleModality: 'SINGLE_PAYMENT_CREDIT',
      paymentMethod: 'CREDIT',
      customerId: rosa.customerId,
      totalAmount: '9.00',
    });
    expect(cycles).toEqual([
      expect.objectContaining({
        cycleNumber: 1,
        periodYear: 2026,
        periodMonth: 11,
        status: 'OPEN',
      }),
    ]);
    expect(cycles[0]!.cutOffDate.toISOString()).toBe('2026-11-21T04:59:59.999Z');
    expect(charges).toHaveLength(2);
    expect(charges[0]).toMatchObject({
      chargeModality: 'SINGLE_PAYMENT',
      principalAmount: '9.00',
      settlementCycleId: cycles[0]!.id,
      compensatoryRateValue: '0.0300',
      compensatoryPeriod: 'MONTHLY',
      moratoryRateValue: '0.0010',
      installmentsCount: null,
    });
    expect((await accountOf(ctx, rosa.accountId)).currentBalance).toBe('18.00');
  });

  it('el exceso de límite no deja nada a medias (crit. 2)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx, { initialStock: '100' });
    const rosa = await neighbor(ctx, { creditLimit: '40.00' });
    const result = await fiar.execute({
      storeId: ctx.storeId,
      cashierId: ctx.ownerId,
      customerId: rosa.customerId,
      cart: [{ productId: milk, quantity: '10' }],
      plan: { mode: 'SINGLE' },
      now: NOW,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'EXCEEDS_AVAILABLE', excess: '5.00', available: '40.00' },
    });
    const cycles = await withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(settlementCycles)
        .where(eq(settlementCycles.creditAccountId, rosa.accountId)),
    );
    expect(cycles).toHaveLength(0);
    expect(await stockOf(ctx, milk)).toBe('100.000');
  });

  it('dos cajas fiando a la vez no pasan juntas el límite', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx, { initialStock: '100' });
    const rosa = await neighbor(ctx, { creditLimit: '50.00' });
    const attempt = () =>
      fiar.execute({
        storeId: ctx.storeId,
        cashierId: ctx.ownerId,
        customerId: rosa.customerId,
        cart: [{ productId: milk, quantity: '8' }],
        plan: { mode: 'SINGLE' },
        now: NOW,
      });
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      expect.objectContaining({ error: expect.objectContaining({ code: 'EXCEEDS_AVAILABLE' }) }),
    ]);
    expect((await accountOf(ctx, rosa.accountId)).currentBalance).toBe('36.00');
  });

  it('un ciclo vencido bloquea el fiado (crit. 8)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await withTenant(ctx.storeId, (tx) =>
      tx.insert(settlementCycles).values({
        storeId: ctx.storeId,
        creditAccountId: rosa.accountId,
        cycleNumber: 1,
        periodYear: 2026,
        periodMonth: 9,
        cutOffDate: new Date('2026-09-21T04:59:59.999Z'),
        paymentDueDate: new Date('2026-09-27T04:59:59.999Z'),
        status: 'OVERDUE',
      }),
    );
    const result = await fiar.execute({
      storeId: ctx.storeId,
      cashierId: ctx.ownerId,
      customerId: rosa.customerId,
      cart: [{ productId: milk, quantity: '1' }],
      plan: { mode: 'SINGLE' },
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: { code: 'ACCOUNT_OVERDUE' } });
  });

  it('un ciclo ya liquidado no recibe cargos nuevos (D8)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await withTenant(ctx.storeId, (tx) =>
      tx.insert(settlementCycles).values({
        storeId: ctx.storeId,
        creditAccountId: rosa.accountId,
        cycleNumber: 1,
        periodYear: 2026,
        periodMonth: 11,
        cutOffDate: new Date('2026-11-21T04:59:59.999Z'),
        paymentDueDate: new Date('2026-11-27T04:59:59.999Z'),
        status: 'BILLED',
      }),
    );
    const result = await fiar.execute({
      storeId: ctx.storeId,
      cashierId: ctx.ownerId,
      customerId: rosa.customerId,
      cart: [{ productId: milk, quantity: '1' }],
      plan: { mode: 'SINGLE' },
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: { code: 'CYCLE_CLOSED' } });
    expect(await stockOf(ctx, milk)).toBe('10.000');
  });

  it('en cuotas guarda el cronograma francés y la deuda sube solo el capital (D3)', async () => {
    const ctx = await storeWithOwner();
    const stove = await product(ctx, {
      name: 'Cocina a gas',
      cashPrice: '450.00',
      initialStock: '2',
      allowsInstallments: true,
    });
    const rosa = await neighbor(ctx, { creditLimit: '1000.00' });
    const result = await fiar.execute({
      storeId: ctx.storeId,
      cashierId: ctx.ownerId,
      customerId: rosa.customerId,
      cart: [{ productId: stove, quantity: '1' }],
      plan: { mode: 'INSTALLMENTS', count: 3 },
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.installments).toEqual({ count: 3, amount: expect.any(String) });

    const [charge, rows] = await withTenant(ctx.storeId, async (tx) => {
      const [c] = await tx
        .select()
        .from(creditCharges)
        .where(eq(creditCharges.saleId, result.value.saleId));
      return [
        c!,
        await tx
          .select()
          .from(creditInstallments)
          .where(eq(creditInstallments.creditChargeId, c!.id))
          .orderBy(creditInstallments.installmentNumber),
      ] as const;
    });
    // Gracia del 15 al 26 de noviembre en 30/360
    expect(charge).toMatchObject({
      chargeModality: 'INSTALLMENTS',
      installmentsCount: 3,
      graceDays: 11,
    });
    expect(rows.map((r) => r.installmentNumber)).toEqual([1, 2, 3]);
    expect(rows[0]!.initialBalance).toBe(charge.capitalizedAmount);
    expect(rows[2]!.remainingBalance).toBe('0.00');
    expect(rows[0]!.dueDate.toISOString()).toBe('2026-12-27T04:59:59.999Z');
    expect((await accountOf(ctx, rosa.accountId)).currentBalance).toBe('450.00');
  });

  it('el cargo y la venta no se pueden borrar', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    const result = await fiar.execute({
      storeId: ctx.storeId,
      cashierId: ctx.ownerId,
      customerId: rosa.customerId,
      cart: [{ productId: milk, quantity: '1' }],
      plan: { mode: 'SINGLE' },
      now: NOW,
    });
    if (!result.ok) throw new Error('fiado fallido');
    await expect(
      withTenant(ctx.storeId, (tx) => tx.delete(sales).where(eq(sales.id, result.value.saleId))),
    ).rejects.toThrow();
  });
});
