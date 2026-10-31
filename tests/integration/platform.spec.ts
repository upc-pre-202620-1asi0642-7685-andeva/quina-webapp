import { randomInt, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AddRateCapUseCase,
  CreateStoreUseCase,
  SetStoreActiveUseCase,
} from '@/core/application/platform/manage-platform';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import { DrizzleAccountSetupTokens, readAccountSetup } from '@/infrastructure/auth/account-setup';
import { closeDb, db } from '@/infrastructure/db/connection';
import { closePlatformDb } from '@/infrastructure/db/platform-connection';
import { DrizzlePlatformStoreRepository } from '@/infrastructure/db/repositories/drizzle-platform-store-repository';
import { DrizzleRateCapRepository } from '@/infrastructure/db/repositories/drizzle-rate-cap-repository';
import {
  creditRateCaps,
  sessions,
  stores,
  storeSubscriptions,
  units,
  users,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { testEnv } from './env';

// Los archivos comparten la base: se deja el tope sembrado como estaba
const owner = postgres(testEnv.ownerUrl, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner`
    DELETE FROM credit_rate_caps
     WHERE rate_kind = 'MORATORY' AND currency = 'USD' AND valid_from > '2026-05-01'`;
  await owner`
    UPDATE credit_rate_caps SET valid_to = NULL
     WHERE rate_kind = 'MORATORY' AND currency = 'USD' AND valid_from = '2026-05-01'`;
  await owner.end();
  await closeDb();
  await closePlatformDb();
});

const NOW = new Date();

class CapturingMailer implements NotificationMailer {
  lastUrl = '';
  async sendCustomerWelcome() {}
  async sendAccountSetup(input: { url: string; audience: string }) {
    expect(input.audience).toBe('owner');
    this.lastUrl = input.url;
  }
}

async function platformAdmin() {
  const [admin] = await db
    .insert(users)
    .values({
      name: 'Admin Quina',
      email: `admin-${randomUUID().slice(0, 8)}@andeva.test`,
      emailVerified: true,
      role: 'PLATFORM_ADMIN',
    })
    .returning({ id: users.id });
  return admin!.id;
}

const ruc = () => `20${String(randomInt(1e9)).padStart(9, '0')}`;
const email = () => `dueno-${randomUUID().slice(0, 8)}@store.test`;

function createStore(mailer = new CapturingMailer()) {
  return {
    mailer,
    useCase: new CreateStoreUseCase(
      new DrizzlePlatformStoreRepository(),
      new DrizzleAccountSetupTokens(),
      mailer,
    ),
  };
}

const command = (adminId: string) => ({
  adminId,
  commercialName: 'Bodega Doña Rosa',
  businessTurn: 'BODEGA',
  taxId: ruc(),
  ownerName: 'Rosa Quispe',
  ownerEmail: email(),
  locale: 'es' as const,
  setupUrl: (token: string) => `http://localhost:3100/app/auth/accept-invite?token=${token}`,
  now: NOW,
});

describe('plataforma: tiendas (US01) contra PostgreSQL', () => {
  it('crea la tienda en Casero activa, con unidades y el dueño invitado', async () => {
    const adminId = await platformAdmin();
    const { mailer, useCase } = createStore();
    const result = await useCase.execute(command(adminId));
    expect(result).toMatchObject({ ok: true, value: { mailSent: true } });
    const storeId = result.ok ? result.value.storeId : '';

    const [subscription] = await withTenant(storeId, (tx) =>
      tx.select().from(storeSubscriptions).where(eq(storeSubscriptions.storeId, storeId)),
    );
    expect(subscription).toMatchObject({ planTier: 'CASERO', status: 'ACTIVE', trialEndsAt: null });
    const storeUnits = await withTenant(storeId, (tx) =>
      tx.select({ code: units.code }).from(units).where(eq(units.storeId, storeId)),
    );
    expect(storeUnits.map((u) => u.code).sort()).toEqual(['KG', 'LTR', 'UND']);

    const token = new URL(mailer.lastUrl).searchParams.get('token') ?? '';
    expect(await readAccountSetup(token, new Date())).toMatchObject({
      storeName: 'Bodega Doña Rosa',
    });
  });

  it('rechaza RUC o correo repetidos (crit. 4)', async () => {
    const adminId = await platformAdmin();
    const { useCase } = createStore();
    const first = command(adminId);
    expect((await useCase.execute(first)).ok).toBe(true);
    expect(await useCase.execute({ ...command(adminId), taxId: first.taxId })).toEqual({
      ok: false,
      error: 'TAX_ID_TAKEN',
    });
    expect(await useCase.execute({ ...command(adminId), ownerEmail: first.ownerEmail })).toEqual({
      ok: false,
      error: 'EMAIL_TAKEN',
    });
  });

  it('suspender cierra las sesiones de la tienda y reactivar la devuelve', async () => {
    const adminId = await platformAdmin();
    const { useCase } = createStore();
    const created = await useCase.execute(command(adminId));
    const storeId = created.ok ? created.value.storeId : '';
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.storeId, storeId), eq(users.role, 'STORE_OWNER')));
    await db.insert(sessions).values({
      userId: owner!.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const setActive = new SetStoreActiveUseCase(new DrizzlePlatformStoreRepository());
    expect((await setActive.execute({ adminId, storeId, active: false, now: NOW })).ok).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, owner!.id))).toHaveLength(0);
    // El enlace de una tienda suspendida no sirve
    const [store] = await db.select().from(stores).where(eq(stores.id, storeId));
    expect(store?.isActive).toBe(false);

    expect((await setActive.execute({ adminId, storeId, active: true, now: NOW })).ok).toBe(true);
    expect(
      await setActive.execute({ adminId, storeId: randomUUID(), active: false, now: NOW }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('plataforma: topes del BCRP (decisión 4)', () => {
  it('una vigencia nueva cierra la anterior el día previo; no se retrocede', async () => {
    const adminId = await platformAdmin();
    const addCap = new AddRateCapUseCase(new DrizzleRateCapRepository());
    const base = {
      adminId,
      kind: 'MORATORY' as const,
      currency: 'USD' as const,
      source: 'BCRP, Circular de prueba',
      now: NOW,
    };
    expect(await addCap.execute({ ...base, percent: '15.20', validFrom: '2026-11-01' })).toEqual({
      ok: true,
      value: undefined,
    });
    const rows = await db
      .select()
      .from(creditRateCaps)
      .where(and(eq(creditRateCaps.rateKind, 'MORATORY'), eq(creditRateCaps.currency, 'USD')));
    const previous = rows.find((r) => r.validFrom === '2026-05-01');
    const current = rows.find((r) => r.validFrom === '2026-11-01');
    expect(previous?.validTo).toBe('2026-10-31');
    expect(current).toMatchObject({ maxEffectiveAnnualRate: '0.1520', validTo: null });

    expect(await addCap.execute({ ...base, percent: '14', validFrom: '2026-10-15' })).toEqual({
      ok: false,
      error: 'NOT_AFTER_CURRENT',
    });
    expect(await addCap.execute({ ...base, percent: '0', validFrom: '2027-01-01' })).toEqual({
      ok: false,
      error: 'RATE_NOT_POSITIVE',
    });
  });
});
