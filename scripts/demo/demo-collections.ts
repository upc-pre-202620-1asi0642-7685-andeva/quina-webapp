// pnpm demo:collections: datos de demostración del Plan 4 (decisión P8) en una
// tienda que ya existe, para mostrar en clase el corte, la mora, el cobro y las
// observaciones sin esperar un mes. Las compras se registran en fechas pasadas
// con los mismos casos de uso del mostrador y luego corre el proceso diario de
// hoy, que liquida lo vencido y deja cada ciclo en su estado.
//
// Variables: DEMO_STORE_ID (la tienda; su dueño registra las ventas) y
// DEMO_CONFIRM con el host de DATABASE_URL, para que nadie lo corra contra otra
// base por error. Se niega a correr en producción.
import { randomInt } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { CreateProductUseCase } from '@/core/application/catalog/manage-catalog';
import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import { RegisterCreditSaleUseCase } from '@/core/application/sales/register-credit-sale';
import type { CreditPlan } from '@/core/domain/sales/credit-sale';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { DrizzleDailyProcess } from '@/infrastructure/db/collections/drizzle-daily-process';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { DrizzleSaleRepository } from '@/infrastructure/db/repositories/drizzle-sale-repository';
import { creditAccounts, customers, settlementCycles, users } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import type { ImageStorage } from '@/core/domain/ports/image-storage';

const DAY_MS = 86_400_000;

export type DemoEnv = {
  DATABASE_URL?: string;
  DEMO_STORE_ID?: string;
  DEMO_CONFIRM?: string;
  DEMO_EMAIL?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

/** Valida el destino antes de tocar nada; devuelve la tienda o el motivo del rechazo. */
export function demoTarget(env: DemoEnv): { storeId: string } | { refused: string } {
  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    return { refused: 'La demo no corre en producción.' };
  }
  if (!env.DATABASE_URL) return { refused: 'Falta DATABASE_URL.' };
  if (!env.DEMO_STORE_ID || !/^[0-9a-f-]{36}$/i.test(env.DEMO_STORE_ID)) {
    return { refused: 'Falta DEMO_STORE_ID (el id de la tienda de demostración).' };
  }
  const host = new URL(env.DATABASE_URL).host;
  if (env.DEMO_CONFIRM !== host) {
    return { refused: `Confirma el destino con DEMO_CONFIRM=${host}` };
  }
  return { storeId: env.DEMO_STORE_ID };
}

/** Día del mes (1 a 28) a `offset` días de hoy en Lima; 29 a 31 se vuelven 28. */
function dayAt(now: Date, offset: number): number {
  return Math.min(BusinessDate.fromInstant(new Date(now.getTime() + offset * DAY_MS)).day, 28);
}

const at = (now: Date, offset: number) => new Date(now.getTime() + offset * DAY_MS);

const noImages: ImageStorage = {
  upload: async () => {
    throw new Error('La demo no sube imágenes');
  },
  remove: async () => undefined,
};

export async function runDemo(env: DemoEnv, now = new Date()) {
  const target = demoTarget(env);
  if ('refused' in target) throw new Error(target.refused);
  const { storeId } = target;

  const owner = await withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.storeId, storeId), eq(users.role, 'STORE_OWNER')));
    return row;
  });
  if (!owner) throw new Error('La tienda no tiene dueño.');

  const productRepo = new DrizzleProductRepository();
  const unit = (await productRepo.units(storeId)).find((u) => u.code === 'UND');
  if (!unit) throw new Error('La tienda no tiene la unidad UND.');
  const suffix = String(randomInt(1000, 9999));
  const createProduct = async (name: string, price: string, allowsInstallments = false) => {
    const result = await new CreateProductUseCase(productRepo, noImages).execute({
      storeId,
      actorId: owner.id,
      details: {
        name: `${name} (demo ${suffix})`,
        description: '',
        brand: '',
        sku: '',
        barcode: '',
        unitId: unit.id,
        isService: false,
        allowsInstallments,
      },
      cashPrice: price,
      creditPrice: price,
      minimumStock: '0',
      initialStock: '200',
      image: null,
      now: at(now, -60),
    });
    if (!result.ok) throw new Error(`No se creó ${name}: ${result.error}`);
    return result.value;
  };
  const rice = await createProduct('Arroz Costeño 5 kg', '24.50');
  const oil = await createProduct('Aceite Primor 1 L', '11.90');
  const blender = await createProduct('Licuadora Oster', '240.00', true);

  const email = (alias: string) =>
    env.DEMO_EMAIL
      ? env.DEMO_EMAIL.replace('@', `+${alias}-${suffix}@`)
      : `${alias}-${suffix}@example.test`;

  const neighbor = (
    firstName: string,
    lastName: string,
    cutOffDay: number,
    paymentDueDay: number,
  ) =>
    withTenant(storeId, async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({
          storeId,
          documentType: 'DNI',
          documentNumber: String(randomInt(1e7, 1e8)),
          firstName,
          lastName,
          email: email(firstName.toLowerCase()),
        })
        .returning({ id: customers.id });
      await tx.insert(creditAccounts).values({
        storeId,
        customerId: customer!.id,
        creditLimit: '800.00',
        compensatoryRateType: 'EFFECTIVE',
        compensatoryRateValue: '0.0300',
        compensatoryPeriod: 'MONTHLY',
        moratoryRateType: 'EFFECTIVE',
        moratoryRateValue: '0.0010',
        moratoryPeriod: 'DAILY',
        maxInstallmentMonths: 6,
        cutOffDay,
        paymentDueDay,
        createdAt: at(now, -60),
      });
      return customer!.id;
    });

  const sales = new RegisterCreditSaleUseCase(new DrizzleSaleRepository());
  const fiar = async (
    customerId: string,
    productId: string,
    offset: number,
    quantity = '1',
    plan: CreditPlan = { mode: 'SINGLE' },
  ) => {
    const result = await sales.execute({
      storeId,
      cashierId: owner.id,
      customerId,
      cart: [{ productId, quantity }],
      plan,
      now: at(now, offset),
    });
    if (!result.ok) throw new Error(`No se fió: ${JSON.stringify(result.error)}`);
  };

  // Vencido: el corte fue hace 10 días y el pago hace 3; al cobrar hay mora
  const rosa = await neighbor('Rosa', 'Quispe', dayAt(now, -10), dayAt(now, -3));
  await fiar(rosa, rice, -20, '2');
  await fiar(rosa, oil, -15);
  // Por vencer: el pago es en 2 días; sale el recordatorio
  const juan = await neighbor('Juan', 'Mamani', dayAt(now, -2), dayAt(now, 2));
  await fiar(juan, rice, -12);
  await fiar(juan, oil, -5, '3');
  // Ciclo abierto: compró ayer y el vecino puede observar el cargo
  const carmen = await neighbor('Carmen', 'Huamán', dayAt(now, 5), dayAt(now, 12));
  await fiar(carmen, oil, -1, '2');
  // En cuotas: la licuadora en 3 cuotas, con los días de Rosa
  const pedro = await neighbor('Pedro', 'Condori', dayAt(now, -10), dayAt(now, -3));
  await fiar(pedro, blender, -20, '1', { mode: 'INSTALLMENTS', count: 3 });

  const summary = await new RunDailyProcessUseCase(
    new DrizzleDailyProcess(new NotificationDispatcher(), { storeIds: [storeId] }),
  ).execute({ now, budgetMs: 50_000 });

  const cycles = await withTenant(storeId, (tx) =>
    tx
      .select({
        name: customers.firstName,
        status: settlementCycles.status,
        totalDue: settlementCycles.totalDue,
        due: settlementCycles.paymentDueDate,
      })
      .from(settlementCycles)
      .innerJoin(creditAccounts, eq(creditAccounts.id, settlementCycles.creditAccountId))
      .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
      .where(inArray(customers.id, [rosa, juan, carmen, pedro]))
      .orderBy(customers.firstName, settlementCycles.cutOffDate),
  );
  return {
    summary,
    cycles: cycles.map((c) => ({ ...c, due: BusinessDate.toISO(BusinessDate.fromInstant(c.due)) })),
  };
}
