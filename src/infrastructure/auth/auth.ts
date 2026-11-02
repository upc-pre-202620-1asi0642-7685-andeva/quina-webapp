import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getIP, isAPIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { captcha, emailOTP, lastLoginMethod, magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { decideNewUserRole } from '@/core/domain/identity/new-user-role';
import { PasswordPolicy } from '@/core/domain/identity/password-policy';
import { PersonName } from '@/core/domain/identity/person-name';
import type { AuthMailer } from '@/core/domain/ports/auth-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import { db as defaultDb, type Database } from '@/infrastructure/db/connection';
import { createPortalDirectory } from '@/infrastructure/db/portal/drizzle-portal-directory';
import * as schema from '@/infrastructure/db/schema';
import { getAuthMailer } from '@/infrastructure/email/auth-mailer-factory';
import { isLocale, LOCALE_COOKIE, resolveLocale } from '@/presentation/i18n/resolve-locale';
import { CONSENT_COOKIE, LEGAL_TERMS_VERSION } from './consent';
import { MAGIC_LINK_TTL_SECONDS, magicLinkToken } from './portal-link';
import { createLockout, DISABLED_MESSAGE, LOCKED_MESSAGE } from './lockout-hooks';

export { LOCKED_MESSAGE };

/** Ruta de Better Auth bajo el basePath '/app' de Next (docs §0 y §9). */
export const AUTH_BASE_PATH = '/app/api/auth';

// Argon2id con 64 MB, 3 pasadas y 4 hilos (docs/quina-webapp-documentation.md §7.1).
// Algorithm es un const enum ambiental: con isolatedModules se usa su valor (2).
const ARGON2ID_OPTIONS: Options = {
  algorithm: 2 as Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const OTP_TTL_SECONDS = 15 * 60;
const RESET_TTL_SECONDS = 30 * 60;

export type AuthDeps = {
  db: Database;
  mailer: AuthMailer;
  /** URL pública de la webapp, con su ruta: https://quina.andeva.tech/app */
  appUrl: string;
  secret: string;
  turnstileSecret: string;
  google: { clientId: string; clientSecret: string };
  /** Solo dentro de Next.js (Server Actions); las pruebas lo omiten. */
  withNextCookies?: boolean;
};

export function createAuth(deps: AuthDeps) {
  const origin = new URL(deps.appUrl).origin;
  const lockout = createLockout({ db: deps.db, mailer: deps.mailer });
  const directory = createPortalDirectory(deps.db);

  async function findUser(email: string): Promise<{ preferredLocale: string } | undefined> {
    const [row] = await deps.db
      .select({ preferredLocale: schema.users.preferredLocale })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()));
    return row;
  }

  const plugins = [
    // Cookie legible desde el navegador para marcar "Último usado" (sin guardar en la BD).
    lastLoginMethod({ cookieName: 'quina-last-login' }),
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      changeEmail: { enabled: true },
      async sendVerificationOTP({ email, otp, type }, ctx) {
        // El código de ingreso es del vecino (US14.4): su idioma sale de la tienda
        const portalLocale =
          type === 'sign-in' ? (await directory.linksForEmail(email))[0]?.locale : undefined;
        const locale = resolveLocale({
          userPreference: (await findUser(email))?.preferredLocale ?? portalLocale,
          ...localeHints(requestHeaders(ctx)),
        });
        if (type === 'sign-in') await deps.mailer.sendPortalOtp({ to: email, otp, locale });
        else await deps.mailer.sendVerificationOtp({ to: email, otp, locale });
      },
    }),
    // US14.2: el enlace va dentro de los correos de cobranza; el alta la decide el hook (D7)
    magicLink({
      expiresIn: MAGIC_LINK_TTL_SECONDS,
      storeToken: 'hashed',
      disableSignUp: false,
      sendMagicLink({ token }) {
        const box = magicLinkToken.getStore();
        if (!box) throw new Error('El enlace mágico solo se crea desde createPortalLink.');
        box.token = token;
      },
    }),
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: deps.turnstileSecret,
      endpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'],
    }),
  ];

  return betterAuth({
    // Solo el origen; la ruta /app va dentro de basePath
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
    secret: deps.secret,
    // El sitio reenvía quina.andeva.tech/app/* con el Origin público
    trustedOrigins: [origin],
    database: drizzleAdapter(deps.db, { provider: 'pg', schema, usePlural: true }),
    // Los UUID los genera PostgreSQL (defaultRandom)
    advanced: { database: { generateId: false } },
    user: {
      additionalFields: {
        storeId: { type: 'string', required: false, input: false },
        role: { type: 'string', required: true, input: false, defaultValue: 'PENDING_OWNER' },
        phone: { type: 'string', required: false, input: false },
        preferredLocale: { type: 'string', required: false, input: false, defaultValue: 'es' },
        isActive: { type: 'boolean', required: false, input: false, defaultValue: true },
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_TTL_SECONDS,
      password: {
        hash: (password) => hash(password, ARGON2ID_OPTIONS),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
      async sendResetPassword({ user, url }, request) {
        const locale = resolveLocale({
          userPreference: (user as { preferredLocale?: string }).preferredLocale,
          ...localeHints(request?.headers),
        });
        await deps.mailer.sendPasswordReset({ to: user.email, url, locale });
      },
      async onPasswordReset({ user }) {
        await lockout.onPasswordReset(user.id);
      },
    },
    socialProviders: {
      google: { clientId: deps.google.clientId, clientSecret: deps.google.clientSecret },
    },
    // Tabla rate_limits: en Vercel la memoria no se comparte entre instancias
    rateLimit: { enabled: true, storage: 'database' },
    databaseHooks: {
      user: {
        create: {
          // El dueño que se registra espera crear su tienda; el vecino solo entra
          // si una tienda lo registró con ese correo (Plan 5, D7)
          async before(user, ctx) {
            const headers = requestHeaders(ctx);
            // Solo las peticiones del navegador traen cabeceras; las llamadas
            // internas del servidor (pruebas, scripts) no pasan por la casilla.
            const consented =
              !headers || readCookie(headers, CONSENT_COOKIE) === LEGAL_TERMS_VERSION;
            const links = await directory.linksForEmail(user.email);
            const role = decideNewUserRole({
              path: ctx?.path,
              consented,
              isCustomer: links.length > 0,
            });
            if (role === 'CONSENT_REQUIRED') {
              throw new APIError('BAD_REQUEST', {
                code: 'CONSENT_REQUIRED',
                message: 'Acepta los Términos y condiciones y la Política de privacidad.',
              });
            }
            const cookie = readCookie(headers, LOCALE_COOKIE);
            const preferredLocale: Locale =
              role === 'CUSTOMER' ? links[0]!.locale : isLocale(cookie) ? cookie : 'es';
            return { data: { ...user, role, storeId: null, preferredLocale } };
          },
          // Constancia inmutable de la aceptación, con IP y navegador. El vecino no
          // aceptó los términos del comerciante: su consentimiento está en la tienda (D3)
          async after(user, ctx) {
            const headers = requestHeaders(ctx);
            if (!headers || (user as { role?: string }).role !== 'PENDING_OWNER') return;
            await deps.db.insert(schema.auditLogs).values({
              storeId: null,
              userId: user.id,
              action: 'ACCEPT_TERMS',
              entityName: 'users',
              entityId: user.id,
              newData: { version: LEGAL_TERMS_VERSION, documents: ['terms', 'privacy'] },
              ipAddress: ctx ? getIP(headers, ctx.context.options) : null,
              userAgent: headers.get('user-agent'),
            });
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        if (ctx.path === '/sign-up/email') {
          assertStrongPassword(body.password);
          // Solo el nombre que se escribe en /register; el que llega de Google no se valida
          assertPersonName(body.name);
          // Mensaje claro en lugar de la respuesta genérica de Better Auth
          if (typeof body.email === 'string' && (await findUser(body.email))) {
            throw new APIError('UNPROCESSABLE_ENTITY', {
              code: 'USER_ALREADY_EXISTS',
              message: 'Ese correo ya tiene cuenta. Ingresa.',
            });
          }
        }
        if (
          ctx.path === '/reset-password' ||
          ctx.path === '/change-password' ||
          ctx.path === '/set-password'
        ) {
          assertStrongPassword(body.newPassword);
        }
        if (ctx.path === '/sign-in/email' && typeof body.email === 'string') {
          const headers = requestHeaders(ctx);
          const gate = await lockout.gate(body.email, {
            ipAddress: headers ? getIP(headers, ctx.context.options) : null,
            userAgent: headers?.get('user-agent') ?? null,
          });
          if (gate === 'ACCOUNT_LOCKED') {
            throw new APIError('FORBIDDEN', { code: 'ACCOUNT_LOCKED', message: LOCKED_MESSAGE });
          }
          if (gate === 'ACCOUNT_DISABLED') {
            throw new APIError('FORBIDDEN', {
              code: 'ACCOUNT_DISABLED',
              message: DISABLED_MESSAGE,
            });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email') return;
        // Un fallo llega aquí como el APIError que lanzó el endpoint (dispatch.mjs)
        const returned: unknown = ctx.context.returned;
        if (isAPIError(returned)) {
          const code = (returned.body as { code?: string } | undefined)?.code;
          const email = (ctx.body as { email?: unknown } | undefined)?.email;
          if (code === 'INVALID_EMAIL_OR_PASSWORD' && typeof email === 'string') {
            const headers = requestHeaders(ctx);
            await lockout.onFailure(email, {
              ipAddress: headers ? getIP(headers, ctx.context.options) : null,
              userAgent: headers?.get('user-agent') ?? null,
            });
          }
          return;
        }
        const userId = (returned as { user?: { id?: unknown } } | undefined)?.user?.id;
        if (typeof userId === 'string') await lockout.onSuccess(userId);
      }),
    },
    // nextCookies va al final: copia las cookies de auth.api.* a la respuesta de Next
    plugins: deps.withNextCookies ? [...plugins, nextCookies()] : plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;

function assertPersonName(name: unknown): void {
  if (typeof name === 'string' && PersonName.parse(name).ok) return;
  throw new APIError('BAD_REQUEST', {
    code: 'NAME_INVALID',
    message: 'Escribe tu nombre solo con letras; puedes usar espacios, apóstrofo y guion.',
  });
}

function assertStrongPassword(password: unknown): void {
  if (typeof password !== 'string') return;
  const result = PasswordPolicy.check(password);
  if (!result.ok) {
    throw new APIError('BAD_REQUEST', {
      code: 'PASSWORD_TOO_WEAK',
      message: 'La contraseña necesita 8 caracteres, una mayúscula, un número y un símbolo.',
      rules: result.error,
    });
  }
}

type WithHeaders = { headers?: Headers | undefined; request?: Request | undefined } | null;

function requestHeaders(ctx: WithHeaders | undefined): Headers | undefined {
  return ctx?.headers ?? ctx?.request?.headers;
}

function localeHints(headers: Headers | undefined) {
  return {
    cookie: readCookie(headers, LOCALE_COOKIE),
    acceptLanguage: headers?.get('accept-language'),
  };
}

function readCookie(headers: Headers | undefined, name: string): string | undefined {
  const raw = headers?.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

// Instancia de la app: se crea en el primer uso, como `db` en connection.ts, para
// que importar este módulo (build, pruebas unitarias) no exija las variables.
let instance: Auth | undefined;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

export function getAuth(): Auth {
  instance ??= createAuth({
    db: defaultDb,
    mailer: getAuthMailer(),
    appUrl: required(process.env, 'APP_URL'),
    secret: required(process.env, 'BETTER_AUTH_SECRET'),
    turnstileSecret: required(process.env, 'TURNSTILE_SECRET_KEY'),
    // Sin credenciales Better Auth solo avisa; el botón de Google fallará
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
    withNextCookies: true,
  });
  return instance;
}

export const auth: Auth = new Proxy({} as Auth, {
  get(_target, property) {
    return Reflect.get(getAuth(), property);
  },
  has(_target, property) {
    return Reflect.has(getAuth(), property);
  },
});
