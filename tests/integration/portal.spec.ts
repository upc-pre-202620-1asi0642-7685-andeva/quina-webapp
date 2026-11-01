import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, desc, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VerifyPortalCodeUseCase } from '@/core/application/portal/portal-code';
import { createAuth, type Auth } from '@/infrastructure/auth/auth';
import { createPortalCodes } from '@/infrastructure/auth/portal-codes';
import { createPortalLink } from '@/infrastructure/auth/portal-link';
import { closeDb, db } from '@/infrastructure/db/connection';
import { createPortalDirectory } from '@/infrastructure/db/portal/drizzle-portal-directory';
import { auditLogs, customers, stores, users, verifications } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { OutboxAuthMailer } from '@/infrastructure/email/outbox-auth-mailer';
import { readLatestMail } from '../e2e/support/outbox';
import { neighbor, storeWithOwner } from './support/seed';

// Plan 5, R1: acceso del vecino. `db` es quina_app (no salta RLS).

const APP_URL = 'http://localhost:3100/app';
let outboxDir: string;
let auth: Auth;

beforeAll(async () => {
  outboxDir = await mkdtemp(path.join(os.tmpdir(), 'quina-portal-outbox-'));
  auth = createAuth({
    db,
    mailer: new OutboxAuthMailer(outboxDir),
    appUrl: APP_URL,
    secret: 'test-secret-de-integracion-con-32-caracteres-o-mas',
    turnstileSecret: '1x0000000000000000000000000000000AA',
    google: { clientId: 'google-client-id', clientSecret: 'google-client-secret' },
  });
});

afterAll(async () => {
  await closeDb();
  await rm(outboxDir, { recursive: true, force: true });
});

const directory = createPortalDirectory();
const randomDni = () => String(randomInt(1e8)).padStart(8, '0');
const browser = () => new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '203.0.113.9' });

async function sendCode(email: string) {
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' }, headers: browser() });
  return (await readLatestMail(email, 'portal-otp', { dir: outboxDir })).otp!;
}

describe('funciones SECURITY DEFINER del portal (P1)', () => {
  it('encuentran las tiendas de un correo aunque la RLS no deja ver customers', async () => {
    const a = await storeWithOwner();
    const b = await storeWithOwner();
    const email = `rosa-${randomUUID()}@example.com`;
    const inA = await neighbor(a, { email, preferredLocale: 'qu' });
    const inB = await neighbor(b, { email: email.toUpperCase() });

    expect(await db.select().from(customers).where(eq(customers.email, email))).toEqual([]);
    const links = await directory.linksForEmail(email);
    expect(links).toHaveLength(2);
    expect(links).toEqual(
      expect.arrayContaining([
        { storeId: a.storeId, customerId: inA.customerId, locale: 'qu' },
        { storeId: b.storeId, customerId: inB.customerId, locale: 'es' },
      ]),
    );
  });

  it('dejan fuera al vecino dado de baja y a la tienda inactiva (D2)', async () => {
    const active = await storeWithOwner();
    const closed = await storeWithOwner();
    const email = `rosa-${randomUUID()}@example.com`;
    const kept = await neighbor(active, { email });
    const off = await neighbor(active, { email: `otra-${randomUUID()}@example.com` });
    await neighbor(closed, { email });
    await withTenant(active.storeId, (tx) =>
      tx.update(customers).set({ isActive: false }).where(eq(customers.id, off.customerId)),
    );
    await db.update(stores).set({ isActive: false }).where(eq(stores.id, closed.storeId));

    expect(await directory.linksForEmail(email)).toEqual([
      { storeId: active.storeId, customerId: kept.customerId, locale: 'es' },
    ]);
  });

  it('devuelven los correos distintos de un documento, en minúsculas', async () => {
    const a = await storeWithOwner();
    const b = await storeWithOwner();
    const c = await storeWithOwner();
    const dni = randomDni();
    const tag = randomUUID();
    await neighbor(a, { documentNumber: dni, email: `Rosa-${tag}@a.pe` });
    await neighbor(b, { documentNumber: dni, email: `rosa-${tag}@a.pe` });
    await neighbor(c, { documentNumber: dni, email: `rosa-${tag}@b.pe` });

    const emails = await directory.emailsForDocument({ type: 'DNI', number: dni });
    expect(emails.sort()).toEqual([`rosa-${tag}@a.pe`, `rosa-${tag}@b.pe`]);
    expect(await directory.emailsForDocument({ type: 'CE', number: dni })).toEqual([]);
  });
});

describe('alta del vecino en Better Auth (D7)', () => {
  it('el código de ingreso crea un CUSTOMER con el idioma de su tienda y sin ACCEPT_TERMS', async () => {
    const ctx = await storeWithOwner();
    const email = `rosa-${randomUUID()}@example.com`;
    await neighbor(ctx, { email, preferredLocale: 'en' });

    const otp = await sendCode(email);
    const result = await auth.api.signInEmailOTP({ body: { email, otp }, headers: browser() });

    const [user] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(user).toMatchObject({ role: 'CUSTOMER', storeId: null, emailVerified: true });
    expect(user!.preferredLocale).toBe('en');
    const terms = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, user!.id), eq(auditLogs.action, 'ACCEPT_TERMS')));
    expect(terms).toEqual([]);
  });

  it('rechaza un correo que ninguna tienda registró (US14.3)', async () => {
    const email = `nadie-${randomUUID()}@example.com`;
    const otp = await sendCode(email);
    await expect(
      auth.api.signInEmailOTP({ body: { email, otp }, headers: browser() }),
    ).rejects.toMatchObject({ body: { code: 'CONSENT_REQUIRED' } });
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
  });
});

describe('códigos del portal sobre verifications (D4 y D6)', () => {
  const codes = () => createPortalCodes({ db, send: async () => {} });

  it('reconoce el formato de Better Auth: el código acierta sin gastar intentos', async () => {
    const email = `rosa-${randomUUID()}@example.com`;
    const otp = await sendCode(email);
    expect(await codes().emailForCode([email], otp)).toBe(email);
    expect(await codes().lastSentAt(email)).toBeInstanceOf(Date);
    const [row] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `sign-in-otp-${email}`));
    expect(row!.value.endsWith(':0')).toBe(true);
  });

  it('un código errado con 3 correos no bloquea a ninguno antes de tiempo', async () => {
    const tag = randomUUID();
    const emails = [`a-${tag}@x.pe`, `b-${tag}@x.pe`, `c-${tag}@x.pe`];
    const otps = await Promise.all(emails.map(sendCode));
    const dni = randomDni();
    const verify = new VerifyPortalCodeUseCase(
      { linksForEmail: async () => [], emailsForDocument: async () => emails },
      codes(),
    );
    const wrong = otps.includes('000000') ? '111111' : '000000';

    expect((await verify.execute({ document: { type: 'DNI', number: dni }, code: wrong })).ok).toBe(
      false,
    );
    const rows = await db
      .select({ value: verifications.value })
      .from(verifications)
      .where(like(verifications.identifier, `sign-in-otp-%-${tag}@x.pe`));
    expect(rows.map((r) => r.value.split(':').at(-1)).sort()).toEqual(['1', '1', '1']);

    // El código bueno del tercero sigue sirviendo y Better Auth lo acepta
    expect(
      await verify.execute({ document: { type: 'DNI', number: dni }, code: otps[2]! }),
    ).toEqual({ ok: true, value: { email: emails[2] } });
  });
});

describe('enlace mágico de los correos (US14.2)', () => {
  const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;

  it('vence a las 72 h, crea el CUSTOMER al canjearse y no sirve dos veces', async () => {
    const ctx = await storeWithOwner();
    const email = `rosa-${randomUUID()}@example.com`;
    await neighbor(ctx, { email, preferredLocale: 'qu' });

    const before = Date.now();
    const url = await createPortalLink(auth, APP_URL, email, ctx.storeId);
    expect(url.startsWith(`${APP_URL}/portal/enter?`)).toBe(true);
    const [row] = await db
      .select()
      .from(verifications)
      .where(like(verifications.identifier, 'magic-link:%'))
      .orderBy(desc(verifications.createdAt))
      .limit(1);
    // storeToken 'hashed': el token del correo no queda en la base
    expect(row!.identifier).not.toContain(tokenOf(url));
    const ttl = row!.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(72 * 3600 * 1000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(72 * 3600 * 1000 + 60_000);

    const result = (await auth.api.magicLinkVerify({
      query: { token: tokenOf(url) },
      headers: browser(),
    })) as { user: { id: string } };
    const [user] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(user).toMatchObject({ role: 'CUSTOMER', preferredLocale: 'qu', emailVerified: true });

    await expect(
      auth.api.magicLinkVerify({ query: { token: tokenOf(url) }, headers: browser() }),
    ).rejects.toBeDefined();
  });

  it('el cron puede crear 10 enlaces seguidos: auth.api no pasa por el límite de tasa', async () => {
    const ctx = await storeWithOwner();
    const email = `rosa-${randomUUID()}@example.com`;
    await neighbor(ctx, { email });
    const urls: string[] = [];
    for (let i = 0; i < 10; i += 1)
      urls.push(await createPortalLink(auth, APP_URL, email, ctx.storeId));
    expect(new Set(urls.map(tokenOf)).size).toBe(10);
  });

  it('fuera de createPortalLink no se crea un enlace (nadie pide uno por HTTP)', async () => {
    await expect(
      auth.api.signInMagicLink({ body: { email: 'x@example.com' }, headers: browser() }),
    ).rejects.toBeDefined();
  });
});
