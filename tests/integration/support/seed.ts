import { randomInt, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { CreateProductUseCase } from '@/core/application/catalog/manage-catalog';
import { RegisterCreditSaleUseCase } from '@/core/application/sales/register-credit-sale';
import type { CreditPlan } from '@/core/domain/sales/credit-sale';
import { db } from '@/infrastructure/db/connection';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { DrizzleSaleRepository } from '@/infrastructure/db/repositories/drizzle-sale-repository';
import { BASE_UNITS } from '@/infrastructure/db/repositories/drizzle-store-registration-repository';
import {
  creditAccounts,
  creditCharges,
  creditInstallments,
  customers,
  notificationLogs,
  products,
  settlementCycles,
  stores,
  storeSubscriptions,
  units,
  users,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { FakeImageStorage } from '../../fakes/in-memory-catalog';

// Siembra de las pruebas de cobranza (Plan 4): tienda, dueño, productos y vecinos
// con cuenta de fiado, igual que tests/integration/sales.spec.ts.

const productRepo = new DrizzleProductRepository();
const fiarUseCase = new RegisterCreditSaleUseCase(new DrizzleSaleRepository());

export async function storeWithOwner(
  plan: 'CASERO' | 'BODEGA_PRO' = 'CASERO',
  overrides: { contactPhone?: string; yapeNumber?: string } = {},
) {
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
      contactPhone: overrides.contactPhone ?? null,
      yapeNumber: overrides.yapeNumber ?? null,
    })
    .returning({ id: stores.id });
  const storeId = store!.id;
  await withTenant(storeId, async (tx) => {
    await tx.insert(storeSubscriptions).values({
      storeId,
      planTier: plan,
      status: 'ACTIVE',
      // Un plan pagado activo exige su periodo (chk_subscription_paid_plan)
      ...(plan === 'CASERO'
        ? {}
        : { billingInterval: 'MONTHLY', currentPeriodEnd: new Date('2099-01-01T00:00:00Z') }),
    });
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

export type Ctx = Awaited<ReturnType<typeof storeWithOwner>>;

export async function product(
  ctx: Ctx,
  overrides: { name?: string; price?: string; allowsInstallments?: boolean; stock?: string } = {},
  now = new Date('2026-09-01T15:00:00Z'),
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
      isService: false,
      allowsInstallments: overrides.allowsInstallments ?? false,
    },
    cashPrice: overrides.price ?? '25.00',
    creditPrice: overrides.price ?? '25.00',
    minimumStock: '0',
    initialStock: overrides.stock ?? '100',
    image: null,
    now,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Vecino con las condiciones del juego de datos 1 (corte 20, pago 26). */
export async function neighbor(
  ctx: Ctx,
  overrides: { creditLimit?: string; email?: string; preferredLocale?: string } = {},
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
        email: overrides.email ?? `rosa-${dni}@example.com`,
        preferredLocale: overrides.preferredLocale ?? null,
      })
      .returning({ id: customers.id });
    const [account] = await tx
      .insert(creditAccounts)
      .values({
        storeId: ctx.storeId,
        customerId: customer!.id,
        creditLimit: overrides.creditLimit ?? '1000.00',
        compensatoryRateType: 'EFFECTIVE',
        compensatoryRateValue: '0.0300',
        compensatoryPeriod: 'MONTHLY',
        moratoryRateType: 'EFFECTIVE',
        moratoryRateValue: '0.0010',
        moratoryPeriod: 'DAILY',
        maxInstallmentMonths: 6,
        cutOffDay: 20,
        paymentDueDay: 26,
      })
      .returning({ id: creditAccounts.id });
    return { customerId: customer!.id, accountId: account!.id };
  });
}

export async function fiar(
  ctx: Ctx,
  customerId: string,
  productId: string,
  now: Date,
  plan: CreditPlan = { mode: 'SINGLE' },
  quantity = '1',
) {
  const result = await fiarUseCase.execute({
    storeId: ctx.storeId,
    cashierId: ctx.ownerId,
    customerId,
    cart: [{ productId, quantity }],
    plan,
    now,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

export const read = {
  account: (ctx: Ctx, accountId: string) =>
    withTenant(ctx.storeId, async (tx) => {
      const [row] = await tx.select().from(creditAccounts).where(eq(creditAccounts.id, accountId));
      return row!;
    }),
  cycles: (ctx: Ctx, accountId: string) =>
    withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(settlementCycles)
        .where(eq(settlementCycles.creditAccountId, accountId))
        .orderBy(settlementCycles.cutOffDate),
    ),
  charges: (ctx: Ctx, accountId: string) =>
    withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(creditCharges)
        .where(eq(creditCharges.creditAccountId, accountId))
        .orderBy(creditCharges.purchaseDate),
    ),
  installments: (ctx: Ctx, accountId: string) =>
    withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(creditInstallments)
        .where(eq(creditInstallments.creditAccountId, accountId))
        .orderBy(creditInstallments.dueDate),
    ),
  logs: (ctx: Ctx) =>
    withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(notificationLogs)
        .where(eq(notificationLogs.storeId, ctx.storeId))
        .orderBy(notificationLogs.createdAt),
    ),
  stock: (ctx: Ctx, productId: string) =>
    withTenant(ctx.storeId, async (tx) => {
      const [row] = await tx
        .select({ stock: products.currentStock })
        .from(products)
        .where(eq(products.id, productId));
      return row!.stock;
    }),
};
