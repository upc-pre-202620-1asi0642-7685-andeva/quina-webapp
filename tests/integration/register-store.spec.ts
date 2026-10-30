import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { RegisterStoreUseCase } from '@/core/application/identity/register-store';
import { closeDb, db } from '@/infrastructure/db/connection';
import { DrizzleStoreRegistrationRepository } from '@/infrastructure/db/repositories/drizzle-store-registration-repository';
import { auditLogs, storeSubscriptions, stores, units, users } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { testEnv } from './env';

// La conexión de mantenimiento solo sirve para contar filas que la app no ve
const owner = postgres(testEnv.ownerUrl, { max: 1, onnotice: () => {} });
const useCase = new RegisterStoreUseCase(new DrizzleStoreRegistrationRepository());

afterAll(async () => {
  await owner.end();
  await closeDb();
});

let seq = 0;

async function pendingUser(): Promise<string> {
  const id = randomUUID();
  seq += 1;
  await db.insert(users).values({
    id,
    name: `Dueño ${seq}`,
    email: `dueno-${id}@example.com`,
    role: 'PENDING_OWNER',
  });
  return id;
}

function ruc(): string {
  seq += 1;
  return `20${String(seq).padStart(9, '0')}`;
}

function input(userId: string, overrides: { taxId?: string; contactEmail?: string } = {}) {
  return {
    userId,
    commercialName: 'Bodega Test',
    businessTurn: 'BODEGA',
    taxId: ruc(),
    ownerFullName: 'Dueño Test',
    contactEmail: `tienda-${randomUUID()}@example.com`,
    ip: '203.0.113.7',
    userAgent: 'vitest',
    now: new Date('2026-10-30T12:00:00.000Z'),
    ...overrides,
  };
}

async function auditCount(userId: string): Promise<number> {
  const [row] = await owner<
    { count: number }[]
  >`SELECT count(*)::int AS count FROM audit_logs WHERE user_id = ${userId}`;
  return row!.count;
}

describe('RegisterStoreUseCase (PostgreSQL)', () => {
  it('crea tienda, prueba Pro, 3 unidades, auditoría y promueve al usuario', async () => {
    const userId = await pendingUser();
    const result = await useCase.execute(input(userId));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { storeId } = result.value;

    const data = await withTenant(storeId, async (tx) => ({
      subs: await tx.select().from(storeSubscriptions),
      unitRows: await tx.select().from(units),
      audits: await tx.select().from(auditLogs),
    }));
    expect(data.subs).toHaveLength(1);
    expect(data.subs[0]).toMatchObject({ planTier: 'BODEGA_PRO', status: 'TRIALING' });
    expect(data.subs[0]!.billingInterval).toBeNull();
    expect(data.subs[0]!.trialEndsAt!.toISOString()).toBe('2026-11-13T12:00:00.000Z');
    expect(data.unitRows.map((u) => [u.code, u.name, u.allowDecimals]).sort()).toEqual([
      ['KG', 'Kilogramo', true],
      ['LTR', 'Litro', true],
      ['UND', 'Unidad', false],
    ]);
    expect(data.audits).toHaveLength(1);
    expect(data.audits[0]).toMatchObject({
      action: 'CREATE_STORE',
      entityName: 'stores',
      entityId: storeId,
      userId,
      ipAddress: '203.0.113.7',
    });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user).toMatchObject({ role: 'STORE_OWNER', storeId });
  });

  it('dos execute concurrentes del mismo usuario crean una sola tienda', async () => {
    const userId = await pendingUser();
    const [a, b] = await Promise.all([
      useCase.execute(input(userId)),
      useCase.execute(input(userId)),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.storeId).toBe(b.value.storeId);
    const [row] = await owner<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM stores WHERE id = ${a.value.storeId}`;
    expect(row!.count).toBe(1);
    expect(await auditCount(userId)).toBe(1);
  });

  it('un RUC repetido de otro usuario devuelve TAX_ID_TAKEN y no deja restos', async () => {
    const first = await pendingUser();
    const second = await pendingUser();
    const taxId = ruc();
    await useCase.execute(input(first, { taxId }));
    const result = await useCase.execute(
      input(second, { taxId: `${taxId.slice(0, 2)} ${taxId.slice(2)}` }),
    );
    expect(result).toEqual({ ok: false, error: 'TAX_ID_TAKEN' });
    const [user] = await db.select().from(users).where(eq(users.id, second));
    expect(user).toMatchObject({ role: 'PENDING_OWNER', storeId: null });
    expect(await auditCount(second)).toBe(0);
  });

  it('un correo de contacto repetido devuelve EMAIL_TAKEN', async () => {
    const first = await pendingUser();
    const second = await pendingUser();
    const contactEmail = `repetido-${randomUUID()}@example.com`;
    await useCase.execute(input(first, { contactEmail }));
    const result = await useCase.execute(
      input(second, { contactEmail: contactEmail.toUpperCase() }),
    );
    expect(result).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });

  it('un usuario inexistente o que no es PENDING_OWNER devuelve USER_NOT_PENDING', async () => {
    const missing = await useCase.execute(input(randomUUID()));
    expect(missing).toEqual({ ok: false, error: 'USER_NOT_PENDING' });

    const customerId = randomUUID();
    await db.insert(users).values({
      id: customerId,
      name: 'Casero',
      email: `c-${customerId}@example.com`,
      role: 'CUSTOMER',
    });
    const result = await useCase.execute(input(customerId));
    expect(result).toEqual({ ok: false, error: 'USER_NOT_PENDING' });
  });

  it('el RUC se guarda normalizado', async () => {
    const userId = await pendingUser();
    const result = await useCase.execute(input(userId, { taxId: '20-123 456789' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [store] = await db.select().from(stores).where(eq(stores.id, result.value.storeId));
    expect(store).toMatchObject({ taxIdType: 'RUC', taxIdNumber: '20123456789' });
  });
});
