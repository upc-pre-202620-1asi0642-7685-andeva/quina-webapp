import { randomInt, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AdjustStockUseCase,
  CreateProductUseCase,
  UpdateProductUseCase,
  type CreateProductCommand,
} from '@/core/application/catalog/manage-catalog';
import { closeDb, db } from '@/infrastructure/db/connection';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { BASE_UNITS } from '@/infrastructure/db/repositories/drizzle-store-registration-repository';
import {
  auditLogs,
  inventoryMovements,
  productPriceHistory,
  products,
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
const repo = new DrizzleProductRepository();

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
  const unitList = await repo.units(storeId);
  return {
    storeId,
    ownerId: owner!.id,
    und: unitList.find((u) => u.code === 'UND')!.id,
    kg: unitList.find((u) => u.code === 'KG')!.id,
  };
}

function command(
  ctx: { storeId: string; ownerId: string; und: string },
  overrides: Partial<CreateProductCommand> = {},
): CreateProductCommand {
  return {
    storeId: ctx.storeId,
    actorId: ctx.ownerId,
    details: {
      name: 'Leche Gloria azul',
      description: '',
      brand: 'Gloria',
      sku: '',
      barcode: '',
      unitId: ctx.und,
      isService: false,
      allowsInstallments: false,
    },
    cashPrice: '4.20',
    creditPrice: '4.50',
    minimumStock: '6',
    initialStock: '24',
    image: null,
    now: NOW,
    ...overrides,
  };
}

async function create(ctx: Awaited<ReturnType<typeof storeWithOwner>>, overrides = {}) {
  const result = await new CreateProductUseCase(repo, new FakeImageStorage()).execute(
    command(ctx, overrides),
  );
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('catálogo en PostgreSQL (US03)', () => {
  it('el stock inicial entra al kardex como conteo y queda en auditoría (D1)', async () => {
    const ctx = await storeWithOwner();
    const productId = await create(ctx);
    const [movements, logs] = await withTenant(ctx.storeId, async (tx) => [
      await tx.select().from(inventoryMovements).where(eq(inventoryMovements.productId, productId)),
      await tx.select().from(auditLogs).where(eq(auditLogs.entityId, productId)),
    ]);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      movementType: 'COUNT_ADJUSTMENT',
      quantity: '24.000',
      stockAfter: '24.000',
      notes: 'Stock inicial',
      userId: ctx.ownerId,
    });
    expect(logs.map((log) => log.action)).toEqual(['CREATE_PRODUCT']);
  });

  it('cambiar precios escribe el historial en la misma transacción (crit. 4)', async () => {
    const ctx = await storeWithOwner();
    const productId = await create(ctx);
    const result = await new UpdateProductUseCase(repo, new FakeImageStorage()).execute({
      ...command(ctx),
      productId,
      cashPrice: '4.40',
      creditPrice: '4.80',
      priceReason: 'Subió el proveedor',
      image: null,
      removeImage: false,
    });
    expect(result.ok).toBe(true);
    const history = await withTenant(ctx.storeId, (tx) =>
      tx.select().from(productPriceHistory).where(eq(productPriceHistory.productId, productId)),
    );
    expect(history).toEqual([
      expect.objectContaining({
        oldCashPrice: '4.20',
        newCashPrice: '4.40',
        oldCreditPrice: '4.50',
        newCreditPrice: '4.80',
        reason: 'Subió el proveedor',
        userId: ctx.ownerId,
      }),
    ]);
  });

  it('el historial de precios y el kardex no se pueden editar', async () => {
    const ctx = await storeWithOwner();
    const productId = await create(ctx);
    await expect(
      withTenant(ctx.storeId, (tx) =>
        tx
          .update(inventoryMovements)
          .set({ notes: 'cambiado' })
          .where(eq(inventoryMovements.productId, productId)),
      ),
    ).rejects.toThrow();
  });

  it('la base rechaza crédito menor que contado aunque se salte el caso de uso (crit. 6)', async () => {
    const ctx = await storeWithOwner();
    await expect(
      withTenant(ctx.storeId, (tx) =>
        tx.insert(products).values({
          storeId: ctx.storeId,
          unitId: ctx.und,
          name: 'Trampa',
          cashPrice: '5.00',
          creditPrice: '4.00',
        }),
      ),
    ).rejects.toThrow();
  });

  it('otra tienda no ve ni toca los productos (RLS)', async () => {
    const ctx = await storeWithOwner();
    const other = await storeWithOwner();
    const productId = await create(ctx);
    const seen = await withTenant(other.storeId, (tx) =>
      tx.select().from(products).where(eq(products.id, productId)),
    );
    expect(seen).toHaveLength(0);
    const adjusted = await new AdjustStockUseCase(repo).execute({
      storeId: other.storeId,
      actorId: other.ownerId,
      productId,
      allowDecimals: false,
      countedStock: '0',
      reason: 'Intento ajeno',
      now: NOW,
    });
    expect(adjusted).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('el conteo físico deja la diferencia negativa en el kardex', async () => {
    const ctx = await storeWithOwner();
    const productId = await create(ctx, {
      initialStock: '2.5',
      details: { ...command(ctx).details, unitId: ctx.kg },
    });
    const result = await new AdjustStockUseCase(repo).execute({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      productId,
      allowDecimals: true,
      countedStock: '1.75',
      reason: 'Conteo del mes',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    const [product] = await withTenant(ctx.storeId, (tx) =>
      tx.select().from(products).where(eq(products.id, productId)),
    );
    expect(product!.currentStock).toBe('1.750');
    const last = await withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.productId, productId),
            eq(inventoryMovements.notes, 'Conteo del mes'),
          ),
        ),
    );
    expect(last[0]).toMatchObject({ quantity: '-0.750', stockAfter: '1.750' });
  });

  it('rechaza un código de barras repetido en la misma tienda', async () => {
    const ctx = await storeWithOwner();
    const barcode = '775' + String(randomInt(1e9)).padStart(10, '0');
    await create(ctx, { details: { ...command(ctx).details, barcode } });
    const result = await new CreateProductUseCase(repo, new FakeImageStorage()).execute(
      command(ctx, { details: { ...command(ctx).details, barcode } }),
    );
    expect(result).toEqual({ ok: false, error: 'BARCODE_TAKEN' });
  });

  it('dos altas simultáneas no pasan juntas el producto 50 de Casero (US26 crit. 8)', async () => {
    const ctx = await storeWithOwner();
    await withTenant(ctx.storeId, (tx) =>
      tx.insert(products).values(
        Array.from({ length: 49 }, (_, i) => ({
          storeId: ctx.storeId,
          unitId: ctx.und,
          name: `Producto ${i}`,
          cashPrice: '1.00',
          creditPrice: '1.00',
        })),
      ),
    );
    const useCase = new CreateProductUseCase(repo, new FakeImageStorage());
    const results = await Promise.all([
      useCase.execute(command(ctx, { initialStock: '' })),
      useCase.execute(command(ctx, { initialStock: '' })),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'PLAN_LIMIT_REACHED' }]);
    const [active] = await withTenant(ctx.storeId, (tx) =>
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(products)
        .where(and(eq(products.storeId, ctx.storeId), eq(products.isActive, true))),
    );
    expect(active!.total).toBe(50);
  });
});
