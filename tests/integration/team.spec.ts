import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CancelInviteUseCase,
  InviteEmployeeUseCase,
  ResendInviteUseCase,
  SetEmployeeActiveUseCase,
} from '@/core/application/team/manage-team';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import {
  DrizzleAccountSetupTokens,
  readAccountSetup,
  redeemAccountSetup,
} from '@/infrastructure/auth/account-setup';
import { createAuth, type Auth } from '@/infrastructure/auth/auth';
import { closeDb, db } from '@/infrastructure/db/connection';
import { listTeam } from '@/infrastructure/db/queries/team';
import { DrizzleTeamRepository } from '@/infrastructure/db/repositories/drizzle-team-repository';
import { sessions, stores, storeSubscriptions, users } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { OutboxAuthMailer } from '@/infrastructure/email/outbox-auth-mailer';

const PASSWORD = 'Vecina#2026x';
const NOW = new Date('2026-11-15T15:00:00Z');

let outboxDir: string;
let auth: Auth;

beforeAll(async () => {
  outboxDir = await mkdtemp(path.join(os.tmpdir(), 'quina-team-outbox-'));
  auth = createAuth({
    db,
    mailer: new OutboxAuthMailer(outboxDir),
    appUrl: 'http://localhost:3100/app',
    secret: 'test-secret-de-integracion-con-32-caracteres-o-mas',
    turnstileSecret: '1x0000000000000000000000000000000AA',
    google: { clientId: 'google-client-id', clientSecret: 'google-client-secret' },
  });
});

afterAll(async () => {
  await closeDb();
  await rm(outboxDir, { recursive: true, force: true });
});

/** Guarda el último enlace enviado para canjearlo en la prueba. */
class CapturingMailer implements NotificationMailer {
  lastUrl = '';
  async sendCustomerWelcome() {}
  async sendAccountSetup(input: { url: string }) {
    this.lastUrl = input.url;
  }
}

async function storeWithOwner(planTier: 'CASERO' | 'BODEGA_PRO' = 'BODEGA_PRO') {
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

function setup(mailer = new CapturingMailer()) {
  const team = new DrizzleTeamRepository();
  const tokens = new DrizzleAccountSetupTokens();
  return {
    mailer,
    invite: new InviteEmployeeUseCase(team, tokens, mailer),
    resend: new ResendInviteUseCase(team, tokens, mailer),
    cancel: new CancelInviteUseCase(team),
    setActive: new SetEmployeeActiveUseCase(team),
  };
}

const mail = {
  storeName: 'Bodega',
  locale: 'es' as const,
  setupUrl: (token: string) => `http://localhost:3100/app/auth/accept-invite?token=${token}`,
};

const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? '';
const email = () => `empleado-${randomUUID().slice(0, 8)}@store.test`;

describe('equipo (US05, US26) contra PostgreSQL', () => {
  it('el invitado define su contraseña con el enlace y luego ingresa', async () => {
    const { storeId, ownerId } = await storeWithOwner();
    const team = setup();
    const address = email();
    const invited = await team.invite.execute({
      storeId,
      actorId: ownerId,
      name: 'Rosa Quispe',
      email: address,
      now: new Date(),
      ...mail,
    });
    expect(invited).toMatchObject({ ok: true, value: { mailSent: true } });
    const token = tokenOf(team.mailer.lastUrl);

    expect(await readAccountSetup(token, new Date())).toMatchObject({ email: address });
    const meta = { ip: '203.0.113.9', userAgent: 'vitest' };
    expect(
      await redeemAccountSetup({ auth }, { token, password: 'debil', now: new Date(), ...meta }),
    ).toBe('PASSWORD_WEAK');
    expect(
      await redeemAccountSetup({ auth }, { token, password: PASSWORD, now: new Date(), ...meta }),
    ).toBe('OK');
    // Un solo uso
    expect(
      await redeemAccountSetup({ auth }, { token, password: PASSWORD, now: new Date(), ...meta }),
    ).toBe('INVALID');

    const signedIn = await auth.api.signInEmail({ body: { email: address, password: PASSWORD } });
    expect(signedIn.user.email).toBe(address);

    // Con contraseña ya no es invitado: no se cancela ni se reenvía, y la lista lo ve activo
    const userId = invited.ok ? invited.value.userId : '';
    const member = { storeId, actorId: ownerId, userId, now: new Date() };
    expect(await team.cancel.execute(member)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await team.resend.execute({ ...member, ...mail })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    const listed = (await listTeam(storeId)).find((m) => m.userId === userId);
    expect(listed?.status).toBe('ACTIVE');
  });

  it('el enlace vencido y el anterior a un reenvío no sirven', async () => {
    const { storeId, ownerId } = await storeWithOwner();
    const team = setup();
    const invited = await team.invite.execute({
      storeId,
      actorId: ownerId,
      name: 'Rosa Quispe',
      email: email(),
      now: NOW,
      ...mail,
    });
    const first = tokenOf(team.mailer.lastUrl);
    const userId = invited.ok ? invited.value.userId : '';
    expect(await readAccountSetup(first, new Date(NOW.getTime() + 73 * 3_600_000))).toBeNull();

    await team.resend.execute({ storeId, actorId: ownerId, userId, now: NOW, ...mail });
    expect(await readAccountSetup(first, NOW)).toBeNull();
    expect(await readAccountSetup(tokenOf(team.mailer.lastUrl), NOW)).not.toBeNull();
  });

  it('rechaza un correo que ya tiene cuenta', async () => {
    const a = await storeWithOwner();
    const b = await storeWithOwner();
    const address = email();
    const team = setup();
    const command = { name: 'Rosa Quispe', email: address, now: NOW, ...mail };
    expect((await team.invite.execute({ ...command, ...a, actorId: a.ownerId })).ok).toBe(true);
    expect(await team.invite.execute({ ...command, ...b, actorId: b.ownerId })).toEqual({
      ok: false,
      error: 'EMAIL_TAKEN',
    });
  });

  it('Casero no admite un 2.º usuario y Pro no admite un 4.º', async () => {
    const casero = await storeWithOwner('CASERO');
    const team = setup();
    const invite = (store: { storeId: string; ownerId: string }) =>
      team.invite.execute({
        storeId: store.storeId,
        actorId: store.ownerId,
        name: 'Rosa Quispe',
        email: email(),
        now: NOW,
        ...mail,
      });
    expect(await invite(casero)).toEqual({ ok: false, error: 'PLAN_LIMIT_REACHED' });

    const pro = await storeWithOwner('BODEGA_PRO');
    expect((await invite(pro)).ok).toBe(true);
    expect((await invite(pro)).ok).toBe(true);
    expect(await invite(pro)).toEqual({ ok: false, error: 'PLAN_LIMIT_REACHED' });
  });

  it('desactivar cierra sesiones, libera el cupo y reactivar lo vuelve a contar', async () => {
    const store = await storeWithOwner('BODEGA_PRO');
    const team = setup();
    const base = { storeId: store.storeId, actorId: store.ownerId, now: NOW };
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await team.invite.execute({
        ...base,
        name: 'Rosa Quispe',
        email: email(),
        ...mail,
      });
      if (r.ok) ids.push(r.value.userId);
    }
    await db.insert(sessions).values({
      userId: ids[0]!,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    expect(await team.setActive.execute({ ...base, userId: ids[0]!, active: false })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await db.select().from(sessions).where(eq(sessions.userId, ids[0]!))).toHaveLength(0);

    // Con el cupo libre entra otro; ya no se puede reactivar al primero
    const third = await team.invite.execute({ ...base, name: 'Ana Ríos', email: email(), ...mail });
    expect(third.ok).toBe(true);
    expect(await team.setActive.execute({ ...base, userId: ids[0]!, active: true })).toEqual({
      ok: false,
      error: 'PLAN_LIMIT_REACHED',
    });
  });

  it('cancela invitaciones solo de su tienda y nunca a quien ya tiene contraseña', async () => {
    const a = await storeWithOwner();
    const b = await storeWithOwner();
    const team = setup();
    const invited = await team.invite.execute({
      storeId: a.storeId,
      actorId: a.ownerId,
      name: 'Rosa Quispe',
      email: email(),
      now: NOW,
      ...mail,
    });
    const userId = invited.ok ? invited.value.userId : '';
    expect(
      await team.cancel.execute({ storeId: b.storeId, actorId: b.ownerId, userId, now: NOW }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(
      await team.cancel.execute({ storeId: a.storeId, actorId: a.ownerId, userId, now: NOW }),
    ).toEqual({ ok: true, value: undefined });
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
  });
});
