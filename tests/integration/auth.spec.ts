import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APIError } from 'better-auth/api';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth, LOCKED_MESSAGE, type Auth } from '@/infrastructure/auth/auth';
import { CONSENT_COOKIE, LEGAL_TERMS_VERSION } from '@/infrastructure/auth/consent';
import { closeDb, db } from '@/infrastructure/db/connection';
import { OutboxAuthMailer } from '@/infrastructure/email/outbox-auth-mailer';
import { readLatestMail } from '../e2e/support/outbox';
import { testEnv } from './env';

// Better Auth contra la base de pruebas. Las llamadas por `auth.handler` (HTTP)
// pasan por el limitador de tasa y por Turnstile; las de `auth.api.*` no, así que
// los casos de bloqueo y OTP usan `auth.api.*` para no chocar con el limitador.

// Claves de prueba públicas de Cloudflare: este secreto siempre aprueba el token ficticio
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const APP_URL = 'http://localhost:3100/app';
const ORIGIN = new URL(APP_URL).origin;
const PASSWORD = 'Bodega#2026x';
// La casilla de /register deja esta cookie (src/infrastructure/auth/consent.ts)
const CONSENT = `${CONSENT_COOKIE}=${LEGAL_TERMS_VERSION}`;

const owner = postgres(testEnv.ownerUrl, { max: 1, onnotice: () => {} });
let outboxDir: string;
let auth: Auth;

function build(appUrl: string): Auth {
  return createAuth({
    db,
    mailer: new OutboxAuthMailer(outboxDir),
    appUrl,
    secret: 'test-secret-de-integracion-con-32-caracteres-o-mas',
    turnstileSecret: TURNSTILE_TEST_SECRET,
    google: { clientId: 'google-client-id', clientSecret: 'google-client-secret' },
  });
}

beforeAll(async () => {
  outboxDir = await mkdtemp(path.join(os.tmpdir(), 'quina-auth-outbox-'));
  auth = build(APP_URL);
});

afterAll(async () => {
  await owner.end();
  await closeDb();
  await rm(outboxDir, { recursive: true, force: true });
});

let ipSeq = 0;
/** Una IP por prueba para que el limitador de tasa no mezcle casos. */
function nextIp(): string {
  ipSeq += 1;
  return `198.51.100.${ipSeq}`;
}

function newEmail(tag: string): string {
  return `${tag}-${randomUUID()}@example.com`;
}

type PostOptions = { ip: string; cookie?: string; captcha?: boolean; origin?: string };

function post(
  target: Auth,
  pathname: string,
  body: unknown,
  { ip, cookie, captcha = true, origin = ORIGIN }: PostOptions,
): Promise<Response> {
  const headers = new Headers({
    'content-type': 'application/json',
    origin,
    'x-forwarded-for': ip,
  });
  if (captcha) headers.set('x-captcha-response', TURNSTILE_TEST_TOKEN);
  if (cookie) headers.set('cookie', cookie);
  return target.handler(
    new Request(`${origin}/app/api/auth${pathname}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

/** Convierte los Set-Cookie de una respuesta en una cabecera Cookie. */
function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function apiError(promise: Promise<unknown>): Promise<APIError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof APIError) return error;
    throw error;
  }
  throw new Error('Se esperaba un APIError');
}

function code(error: APIError): string | undefined {
  return (error.body as { code?: string } | undefined)?.code;
}

type UserRow = {
  id: string;
  email: string;
  email_verified: boolean;
  role: string;
  preferred_locale: string;
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  store_id: string | null;
};

async function userByEmail(email: string): Promise<UserRow | undefined> {
  const [row] = await owner<UserRow[]>`SELECT * FROM users WHERE email = ${email}`;
  return row;
}

/** Usuario con contraseña y correo ya verificado (atajo por SQL). */
async function verifiedUser(email: string, password = PASSWORD): Promise<UserRow> {
  await auth.api.signUpEmail({ body: { name: 'Dueño Prueba', email, password } });
  await owner`UPDATE users SET email_verified = true WHERE email = ${email}`;
  return (await userByEmail(email))!;
}

function signIn(email: string, password: string) {
  return auth.api.signInEmail({ body: { email, password } });
}

async function storeFor(userId: string, isActive = true): Promise<string> {
  const id = randomUUID();
  const digits = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  await owner`
    INSERT INTO stores (id, commercial_name, business_turn, tax_id_type, tax_id_number,
                        owner_full_name, contact_email, is_active)
    VALUES (${id}, 'Bodega Prueba', 'BODEGA', 'RUC', ${`20${digits}`}, 'Dueño Prueba',
            ${`tienda-${id}@example.com`}, ${isActive})`;
  await owner`UPDATE users SET role = 'STORE_OWNER', store_id = ${id} WHERE id = ${userId}`;
  return id;
}

describe('registro con correo y contraseña', () => {
  it('deja PENDING_OWNER sin verificar, con el idioma de la cookie y un hash Argon2id', async () => {
    const email = newEmail('registro');
    const response = await post(
      auth,
      '/sign-up/email',
      { name: 'Rosa Quispe', email, password: PASSWORD },
      { ip: nextIp(), cookie: `quina-lang=qu; ${CONSENT}` },
    );
    expect(response.status).toBe(200);

    const user = await userByEmail(email);
    expect(user).toMatchObject({
      role: 'PENDING_OWNER',
      email_verified: false,
      preferred_locale: 'qu',
      store_id: null,
      failed_login_attempts: 0,
    });

    const [account] = await owner<{ password: string; provider_id: string }[]>`
      SELECT password, provider_id FROM accounts WHERE user_id = ${user!.id}`;
    expect(account!.provider_id).toBe('credential');
    expect(account!.password.startsWith('$argon2id$v=19$m=65536,t=3,p=4')).toBe(true);

    const mail = await readLatestMail(email, 'verification-otp', { dir: outboxDir });
    expect(mail.locale).toBe('qu');
    expect(mail.otp).toMatch(/^\d{6}$/);

    // El OTP vive 15 minutos y no se guarda en texto plano
    const [verification] = await owner<{ value: string; expires_at: Date }[]>`
      SELECT value, expires_at FROM verifications
      WHERE identifier = ${`email-verification-otp-${email}`}`;
    expect(verification!.value.startsWith(mail.otp!)).toBe(false);
    const ttlMs = verification!.expires_at.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(14 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60_000);
  });

  it('sin token de Turnstile el registro se rechaza y no crea usuario', async () => {
    const email = newEmail('sin-captcha');
    const response = await post(
      auth,
      '/sign-up/email',
      { name: 'Sin Captcha', email, password: PASSWORD },
      { ip: nextIp(), captcha: false },
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('MISSING_RESPONSE');
    expect(await userByEmail(email)).toBeUndefined();
  });

  it('rechaza una contraseña que no cumple la política', async () => {
    const email = newEmail('debil');
    const error = await apiError(
      auth.api.signUpEmail({ body: { name: 'Débil', email, password: 'bodega2026' } }),
    );
    expect(code(error)).toBe('PASSWORD_TOO_WEAK');
    expect(await userByEmail(email)).toBeUndefined();
  });

  it('rechaza un nombre con números y no crea la cuenta', async () => {
    const email = newEmail('nombre');
    const response = await post(
      auth,
      '/sign-up/email',
      { name: 'Juan123', email, password: PASSWORD },
      { ip: nextIp(), cookie: CONSENT },
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('NAME_INVALID');
    expect(await userByEmail(email)).toBeUndefined();
  });

  it('sin aceptar términos y privacidad no se crea la cuenta', async () => {
    const email = newEmail('sin-consentimiento');
    const response = await post(
      auth,
      '/sign-up/email',
      { name: 'Sin Consentimiento', email, password: PASSWORD },
      { ip: nextIp() },
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('CONSENT_REQUIRED');
    expect(await userByEmail(email)).toBeUndefined();
  });

  it('deja constancia de la aceptación con versión, IP y navegador', async () => {
    const email = newEmail('consentimiento');
    const ip = nextIp();
    const response = await post(
      auth,
      '/sign-up/email',
      { name: 'Con Consentimiento', email, password: PASSWORD },
      { ip, cookie: CONSENT },
    );
    expect(response.status).toBe(200);

    const user = await userByEmail(email);
    const rows = await owner<{ new_data: unknown; ip_address: string; store_id: null }[]>`
      SELECT new_data, ip_address, store_id FROM audit_logs
      WHERE user_id = ${user!.id} AND action = 'ACCEPT_TERMS'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      new_data: { version: LEGAL_TERMS_VERSION, documents: ['terms', 'privacy'] },
      ip_address: ip,
      store_id: null,
    });
  });

  it('sin cookie de idioma el usuario nace en castellano', async () => {
    const email = newEmail('sin-cookie');
    await auth.api.signUpEmail({ body: { name: 'Sin Cookie', email, password: PASSWORD } });
    expect((await userByEmail(email))!.preferred_locale).toBe('es');
  });
});

describe('verificación del correo con OTP', () => {
  it('antes de verificar no deja ingresar; con el OTP del correo sí', async () => {
    const email = newEmail('verifica');
    await auth.api.signUpEmail({ body: { name: 'Verifica', email, password: PASSWORD } });

    const blocked = await apiError(signIn(email, PASSWORD));
    expect(code(blocked)).toBe('EMAIL_NOT_VERIFIED');
    // Una contraseña correcta sin verificar no cuenta como intento fallido
    expect((await userByEmail(email))!.failed_login_attempts).toBe(0);

    const { otp } = await readLatestMail(email, 'verification-otp', { dir: outboxDir });
    const verified = await auth.api.verifyEmailOTP({ body: { email, otp: otp! } });
    expect(verified.status).toBe(true);
    expect((await userByEmail(email))!.email_verified).toBe(true);

    const session = await signIn(email, PASSWORD);
    expect(session.token).toBeTruthy();
    expect((await userByEmail(email))!.last_login_at).not.toBeNull();
  });

  it('un OTP vencido (15 minutos) se rechaza', async () => {
    const email = newEmail('vencido');
    await auth.api.signUpEmail({ body: { name: 'Vencido', email, password: PASSWORD } });
    const { otp } = await readLatestMail(email, 'verification-otp', { dir: outboxDir });
    await owner`
      UPDATE verifications SET expires_at = expires_at - interval '15 minutes'
      WHERE identifier = ${`email-verification-otp-${email}`}`;

    const error = await apiError(auth.api.verifyEmailOTP({ body: { email, otp: otp! } }));
    expect(code(error)).toBe('OTP_EXPIRED');
    expect((await userByEmail(email))!.email_verified).toBe(false);
  });

  it('5 códigos erróneos invalidan el OTP aunque luego llegue el correcto', async () => {
    const email = newEmail('intentos');
    await auth.api.signUpEmail({ body: { name: 'Intentos', email, password: PASSWORD } });
    const { otp } = await readLatestMail(email, 'verification-otp', { dir: outboxDir });
    const wrong = otp === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      const error = await apiError(auth.api.verifyEmailOTP({ body: { email, otp: wrong } }));
      expect(code(error)).toBe('INVALID_OTP');
    }
    const error = await apiError(auth.api.verifyEmailOTP({ body: { email, otp: otp! } }));
    expect(code(error)).toBe('TOO_MANY_ATTEMPTS');
    expect((await userByEmail(email))!.email_verified).toBe(false);
  });

  it('el cambio de correo con OTP actualiza users.email', async () => {
    const email = newEmail('cambio');
    const target = newEmail('nuevo');
    await verifiedUser(email);
    const signedIn = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    });
    const headers = new Headers({ cookie: cookieHeader(signedIn) });

    await auth.api.requestEmailChangeEmailOTP({ body: { newEmail: target }, headers });
    const { otp } = await readLatestMail(target, 'verification-otp', { dir: outboxDir });
    await auth.api.changeEmailEmailOTP({ body: { newEmail: target, otp: otp! }, headers });

    expect(await userByEmail(email)).toBeUndefined();
    expect(await userByEmail(target)).toMatchObject({ email: target, email_verified: true });
  });
});

describe('Google y vinculación de cuentas', () => {
  it('el usuario creado por el flujo social nace PENDING_OWNER con correo verificado', async () => {
    const email = newEmail('google');
    const context = await auth.$context;
    const { user } = await context.internalAdapter.createOAuthUser(
      { name: 'Rosa Google', email, emailVerified: true },
      { providerId: 'google', accountId: `google-${randomUUID()}` },
    );
    expect(user).toMatchObject({ role: 'PENDING_OWNER', emailVerified: true });
    expect(await userByEmail(email)).toMatchObject({
      role: 'PENDING_OWNER',
      email_verified: true,
      preferred_locale: 'es',
    });
  });

  it('registrarse con contraseña con un correo que ya tiene Google da error y no duplica', async () => {
    const email = newEmail('duplicado');
    const context = await auth.$context;
    await context.internalAdapter.createOAuthUser(
      { name: 'Rosa Google', email, emailVerified: true },
      { providerId: 'google', accountId: `google-${randomUUID()}` },
    );

    const error = await apiError(
      auth.api.signUpEmail({
        body: { name: 'Rosa', email: email.toUpperCase(), password: PASSWORD },
      }),
    );
    expect(code(error)).toBe('USER_ALREADY_EXISTS');

    const [row] = await owner<{ count: number }[]>`
      SELECT count(*)::int AS count FROM users WHERE email = ${email}`;
    expect(row!.count).toBe(1);
    const [accounts] = await owner<{ count: number }[]>`
      SELECT count(*)::int AS count FROM accounts a JOIN users u ON u.id = a.user_id
      WHERE u.email = ${email} AND a.provider_id = 'credential'`;
    expect(accounts!.count).toBe(0);
  });
});

describe('limitador de tasa', () => {
  it('guarda contadores en rate_limits y corta al 4.º intento en 10 s', async () => {
    const ip = nextIp();
    const email = newEmail('tasa');
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await post(auth, '/sign-in/email', { email, password: 'Mala#1234' }, { ip });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);

    const rows = await owner<{ key: string; count: number }[]>`
      SELECT key, count FROM rate_limits WHERE key = ${`${ip}|/sign-in/email`}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(3);
  });
});

describe('bloqueo por intentos fallidos', () => {
  it('5 contraseñas malas bloquean; la correcta en el 6.º intento da ACCOUNT_LOCKED y avisa', async () => {
    const email = newEmail('bloqueo');
    const user = await verifiedUser(email);

    for (let i = 1; i <= 5; i += 1) {
      const error = await apiError(signIn(email, 'Equivocada#1'));
      expect(code(error)).toBe('INVALID_EMAIL_OR_PASSWORD');
      expect((await userByEmail(email))!.failed_login_attempts).toBe(i);
    }
    const locked = (await userByEmail(email))!;
    const lockMs = locked.locked_until!.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(14 * 60_000);
    expect(lockMs).toBeLessThanOrEqual(15 * 60_000);

    const error = await apiError(signIn(email, PASSWORD));
    expect(error.statusCode).toBe(403);
    expect(code(error)).toBe('ACCOUNT_LOCKED');
    expect(error.message).toBe(LOCKED_MESSAGE);

    const alert = await readLatestMail(email, 'lockout-alert', { dir: outboxDir });
    expect(alert.locale).toBe('es');

    const audits = await owner<{ store_id: string | null; entity_name: string; user_id: string }[]>`
      SELECT store_id, entity_name, user_id FROM audit_logs
      WHERE action = 'LOCK_ACCOUNT' AND entity_id = ${user.id}`;
    expect(audits).toEqual([{ store_id: null, entity_name: 'users', user_id: user.id }]);
  });

  it('cuando locked_until ya pasó, ingresa y el contador vuelve a 0', async () => {
    const email = newEmail('desbloqueo');
    await verifiedUser(email);
    for (let i = 0; i < 5; i += 1) await apiError(signIn(email, 'Equivocada#1'));
    await owner`UPDATE users SET locked_until = now() - interval '1 second' WHERE email = ${email}`;

    const session = await signIn(email, PASSWORD);
    expect(session.token).toBeTruthy();
    const user = (await userByEmail(email))!;
    expect(user.failed_login_attempts).toBe(0);
    expect(user.locked_until).toBeNull();
    expect(user.last_login_at).not.toBeNull();
  });

  it('un ingreso correcto antes del 5.º fallo reinicia el contador', async () => {
    const email = newEmail('reinicio');
    await verifiedUser(email);
    for (let i = 0; i < 4; i += 1) await apiError(signIn(email, 'Equivocada#1'));
    expect((await userByEmail(email))!.failed_login_attempts).toBe(4);
    await signIn(email, PASSWORD);
    expect((await userByEmail(email))!.failed_login_attempts).toBe(0);
  });

  it('un correo inexistente no cambia nada', async () => {
    const email = newEmail('fantasma');
    const error = await apiError(signIn(email, 'Equivocada#1'));
    expect(code(error)).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect(await userByEmail(email)).toBeUndefined();
  });

  it('el bloqueo de un dueño con tienda deja la auditoría en su tienda', async () => {
    const email = newEmail('dueno');
    const user = await verifiedUser(email);
    const storeId = await storeFor(user.id);
    for (let i = 0; i < 5; i += 1) await apiError(signIn(email, 'Equivocada#1'));

    const audits = await owner<{ store_id: string | null }[]>`
      SELECT store_id FROM audit_logs WHERE action = 'LOCK_ACCOUNT' AND entity_id = ${user.id}`;
    expect(audits).toEqual([{ store_id: storeId }]);
  });

  it('un usuario desactivado o de una tienda inactiva no ingresa', async () => {
    const inactiveEmail = newEmail('inactivo');
    await verifiedUser(inactiveEmail);
    await owner`UPDATE users SET is_active = false WHERE email = ${inactiveEmail}`;
    expect(code(await apiError(signIn(inactiveEmail, PASSWORD)))).toBe('ACCOUNT_DISABLED');

    const storeEmail = newEmail('tienda-inactiva');
    const user = await verifiedUser(storeEmail);
    await storeFor(user.id, false);
    expect(code(await apiError(signIn(storeEmail, PASSWORD)))).toBe('ACCOUNT_DISABLED');
  });

  it('restablecer la contraseña reinicia el contador y revoca las sesiones', async () => {
    const email = newEmail('reset');
    const user = await verifiedUser(email);
    await signIn(email, PASSWORD);
    for (let i = 0; i < 3; i += 1) await apiError(signIn(email, 'Equivocada#1'));

    await auth.api.requestPasswordReset({ body: { email } });
    const mail = await readLatestMail(email, 'password-reset', { dir: outboxDir });
    const token = new URL(mail.url!).pathname.split('/').pop()!;
    await auth.api.resetPassword({ body: { token, newPassword: 'Nueva#2026x' } });

    const after = (await userByEmail(email))!;
    expect(after.failed_login_attempts).toBe(0);
    expect(after.locked_until).toBeNull();
    const [sessions] = await owner<{ count: number }[]>`
      SELECT count(*)::int AS count FROM sessions WHERE user_id = ${user.id}`;
    expect(sessions!.count).toBe(0);
  });

  it('un token de restablecimiento vencido (30 minutos) se rechaza', async () => {
    const email = newEmail('reset-vencido');
    await verifiedUser(email);

    await auth.api.requestPasswordReset({ body: { email } });
    const mail = await readLatestMail(email, 'password-reset', { dir: outboxDir });
    const token = new URL(mail.url!).pathname.split('/').pop()!;

    await owner`
      UPDATE verifications SET expires_at = expires_at - interval '30 minutes'
      WHERE identifier = ${`reset-password:${token}`}`;

    const error = await apiError(
      auth.api.resetPassword({ body: { token, newPassword: 'Nueva#2026x' } }),
    );
    expect(code(error)).toBe('INVALID_TOKEN');
  });
});

describe('sesión y cookie', () => {
  it('signOut borra la fila de sessions', async () => {
    const email = newEmail('salida');
    const user = await verifiedUser(email);
    const ip = nextIp();
    const signedIn = await post(auth, '/sign-in/email', { email, password: PASSWORD }, { ip });
    expect(signedIn.status).toBe(200);
    const count = async () =>
      (
        await owner<{ count: number }[]>`
          SELECT count(*)::int AS count FROM sessions WHERE user_id = ${user.id}`
      )[0]!.count;
    expect(await count()).toBe(1);

    const out = await post(auth, '/sign-out', {}, { ip, cookie: cookieHeader(signedIn) });
    expect(out.status).toBe(200);
    expect(await count()).toBe(0);
  });

  it('la cookie de sesión es HttpOnly, SameSite=Lax y Path=/ (sin Secure en http)', async () => {
    const email = newEmail('cookie');
    await verifiedUser(email);
    const response = await post(
      auth,
      '/sign-in/email',
      { email, password: PASSWORD },
      {
        ip: nextIp(),
      },
    );
    const session = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('better-auth.session_token='));
    expect(session).toBeDefined();
    expect(session).toMatch(/;\s*HttpOnly/i);
    expect(session).toMatch(/;\s*SameSite=Lax/i);
    expect(session).toMatch(/;\s*Path=\/(;|$)/);
    expect(session).not.toMatch(/;\s*Secure/i);
  });

  it('en https la cookie además es Secure', async () => {
    const secureUrl = 'https://quina.andeva.tech/app';
    const secureAuth = build(secureUrl);
    const email = newEmail('https');
    await verifiedUser(email);
    const response = await post(
      secureAuth,
      '/sign-in/email',
      { email, password: PASSWORD },
      {
        ip: nextIp(),
        origin: new URL(secureUrl).origin,
      },
    );
    expect(response.status).toBe(200);
    const session = response.headers
      .getSetCookie()
      .find((c) => c.includes('better-auth.session_token='));
    expect(session).toMatch(/;\s*Secure/i);
    expect(session).toMatch(/;\s*HttpOnly/i);
    expect(session).toMatch(/;\s*SameSite=Lax/i);
    expect(session).toMatch(/;\s*Path=\/(;|$)/);
  });
});
