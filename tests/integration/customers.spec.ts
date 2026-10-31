import { randomInt, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SaveCreditTermsUseCase,
  type SaveCreditTermsCommand,
} from '@/core/application/credit/save-credit-terms';
import { RegisterCustomerUseCase } from '@/core/application/customers/register-customer';
import { SetCustomerActiveUseCase } from '@/core/application/customers/update-customer';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import { closeDb, db } from '@/infrastructure/db/connection';
import { DrizzleCreditAccountRepository } from '@/infrastructure/db/repositories/drizzle-credit-account-repository';
import { DrizzleCustomerRepository } from '@/infrastructure/db/repositories/drizzle-customer-repository';
import {
  auditLogs,
  creditAccounts,
  customerConsents,
  customers,
  stores,
  storeSubscriptions,
  users,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';

afterAll(async () => {
  await closeDb();
});

const NOW = new Date('2026-11-15T15:00:00Z');
const silentMailer: NotificationMailer = {
  sendCustomerWelcome: async () => {},
  sendAccountSetup: async () => {},
};

// stores y users no tienen RLS; la suscripción sí, así que va con withTenant.
async function storeWithOwner(planTier: 'CASERO' | 'BODEGA_PRO' = 'CASERO') {
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
  await withTenant(storeId, (tx) =>
    tx.insert(storeSubscriptions).values({
      storeId,
      planTier,
      status: 'ACTIVE',
      ...(planTier === 'CASERO'
        ? {}
        : { billingInterval: 'MONTHLY', currentPeriodEnd: new Date('2027-01-01T00:00:00Z') }),
    }),
  );
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
  return { storeId, ownerId: owner!.id };
}

function profile(dni: string) {
  return {
    documentType: 'DNI' as const,
    documentNumber: dni,
    firstName: 'Rosa',
    lastName: 'Quispe',
    phone: '987654321',
    email: `rosa${dni}@correo.pe`,
    address: '',
    preferredLocale: null,
  };
}

async function register(storeId: string, actorId: string, dni: string) {
  const useCase = new RegisterCustomerUseCase(new DrizzleCustomerRepository(), silentMailer);
  return useCase.execute({
    storeId,
    storeName: 'Bodega',
    storeLocale: 'es',
    actorId,
    profile: profile(dni),
    consentAccepted: true,
    consentText: 'Autorizo el tratamiento de mis datos.',
    ip: '203.0.113.5',
    userAgent: 'vitest',
    privacyUrl: 'https://example.test/privacy',
    now: NOW,
  });
}

function terms(storeId: string, actorId: string, customerId: string): SaveCreditTermsCommand {
  return {
    storeId,
    actorId,
    customerId,
    currency: 'PEN',
    creditLimit: '150.00',
    compensatory: { type: 'EFFECTIVE', percent: '20', period: 'ANNUAL', capitalization: null },
    moratory: { type: 'EFFECTIVE', percent: '15', period: 'ANNUAL', capitalization: null },
    cutOffDay: 20,
    paymentDueDay: 26,
    maxInstallmentMonths: 3,
    consentText: 'Límite S/ 150.00',
    ip: '203.0.113.5',
    userAgent: 'vitest',
    now: NOW,
  };
}

const dni = () => String(randomInt(10_000_000, 99_999_999));

describe('vecinos (US04) contra PostgreSQL', () => {
  it('registra vecino, consentimiento y auditoría en la misma transacción', async () => {
    const { storeId, ownerId } = await storeWithOwner();
    const result = await register(storeId, ownerId, dni());
    expect(result.ok).toBe(true);
    const customerId = result.ok ? result.value.customerId : '';

    const rows = await withTenant(storeId, async (tx) => ({
      consents: await tx
        .select()
        .from(customerConsents)
        .where(eq(customerConsents.customerId, customerId)),
      audit: await tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, customerId), eq(auditLogs.storeId, storeId))),
    }));
    expect(rows.consents).toHaveLength(1);
    expect(rows.consents[0]).toMatchObject({
      consentType: 'DATA_PROTECTION_LAW_29733',
      ipAddress: '203.0.113.5',
      evidenceText: 'Autorizo el tratamiento de mis datos.',
    });
    expect(rows.audit.map((a) => a.action)).toEqual(['CREATE_CUSTOMER']);
  });

  it('el mismo DNI se rechaza en la tienda y se acepta en otra (crit. 5)', async () => {
    const a = await storeWithOwner();
    const b = await storeWithOwner();
    const doc = dni();
    expect((await register(a.storeId, a.ownerId, doc)).ok).toBe(true);
    expect(await register(a.storeId, a.ownerId, doc)).toEqual({
      ok: false,
      error: 'DOCUMENT_TAKEN',
    });
    expect((await register(b.storeId, b.ownerId, doc)).ok).toBe(true);
  });

  it('otra tienda no puede dar de baja a un vecino ajeno', async () => {
    const a = await storeWithOwner();
    const b = await storeWithOwner();
    const created = await register(a.storeId, a.ownerId, dni());
    const customerId = created.ok ? created.value.customerId : '';
    const deactivate = new SetCustomerActiveUseCase(new DrizzleCustomerRepository());
    expect(
      await deactivate.execute({
        storeId: b.storeId,
        actorId: b.ownerId,
        customerId,
        active: false,
        now: NOW,
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('condiciones de crédito (US06, US26) contra PostgreSQL', () => {
  const saveTerms = () => new SaveCreditTermsUseCase(new DrizzleCreditAccountRepository());

  it('abre la cuenta con los topes sembrados y rechaza la moratoria sobre el tope', async () => {
    const { storeId, ownerId } = await storeWithOwner();
    const created = await register(storeId, ownerId, dni());
    const customerId = created.ok ? created.value.customerId : '';

    const above = terms(storeId, ownerId, customerId);
    above.moratory = { type: 'EFFECTIVE', percent: '18', period: 'ANNUAL', capitalization: null };
    expect(await saveTerms().execute(above)).toEqual({
      ok: false,
      error: 'MORATORY_RATE_ABOVE_CAP',
    });

    expect(await saveTerms().execute(terms(storeId, ownerId, customerId))).toEqual({
      ok: true,
      value: 'OPENED',
    });
    const [account] = await withTenant(storeId, (tx) =>
      tx.select().from(creditAccounts).where(eq(creditAccounts.customerId, customerId)),
    );
    expect(account).toMatchObject({
      creditLimit: '150.00',
      compensatoryRateValue: '0.2000',
      moratoryRateValue: '0.1500',
      status: 'ACTIVE',
    });
  });

  it('dos aperturas a la vez no pasan juntas el último cupo del Casero', async () => {
    const { storeId, ownerId } = await storeWithOwner();
    const ids: string[] = [];
    for (let i = 0; i < 16; i++) {
      const created = await register(storeId, ownerId, dni());
      if (created.ok) ids.push(created.value.customerId);
    }
    for (const id of ids.slice(0, 14)) {
      expect((await saveTerms().execute(terms(storeId, ownerId, id))).ok).toBe(true);
    }
    const [first, second] = await Promise.all([
      saveTerms().execute(terms(storeId, ownerId, ids[14]!)),
      saveTerms().execute(terms(storeId, ownerId, ids[15]!)),
    ]);
    const outcomes = [first, second].map((r) => (r.ok ? r.value : r.error)).sort();
    expect(outcomes).toEqual(['OPENED', 'PLAN_LIMIT_REACHED']);
  });

  it('no da de baja a un vecino con saldo y suspende la cuenta del que no debe', async () => {
    const { storeId, ownerId } = await storeWithOwner();
    const created = await register(storeId, ownerId, dni());
    const customerId = created.ok ? created.value.customerId : '';
    await saveTerms().execute(terms(storeId, ownerId, customerId));
    await withTenant(storeId, (tx) =>
      tx
        .update(creditAccounts)
        .set({ currentBalance: '25.50' })
        .where(eq(creditAccounts.customerId, customerId)),
    );

    const deactivate = new SetCustomerActiveUseCase(new DrizzleCustomerRepository());
    const input = { storeId, actorId: ownerId, customerId, active: false, now: NOW };
    expect(await deactivate.execute(input)).toEqual({ ok: false, error: 'HAS_BALANCE' });

    await withTenant(storeId, (tx) =>
      tx
        .update(creditAccounts)
        .set({ currentBalance: '0.00' })
        .where(eq(creditAccounts.customerId, customerId)),
    );
    expect((await deactivate.execute(input)).ok).toBe(true);
    const [row] = await withTenant(storeId, (tx) =>
      tx
        .select({ status: creditAccounts.status, active: customers.isActive })
        .from(creditAccounts)
        .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
        .where(eq(creditAccounts.customerId, customerId)),
    );
    expect(row).toEqual({ status: 'SUSPENDED', active: false });
  });
});
