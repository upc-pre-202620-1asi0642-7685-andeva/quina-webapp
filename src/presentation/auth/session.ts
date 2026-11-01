import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { isRole, type Role } from '@/core/domain/identity/roles';
import type { Locale } from '@/core/domain/shared/locale';
import { getAuth } from '@/infrastructure/auth/auth';
import { db } from '@/infrastructure/db/connection';
import { stores, users } from '@/infrastructure/db/schema';
import { isLocale } from '@/presentation/i18n/resolve-locale';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  storeId: string | null;
  preferredLocale: Locale;
};

const PUBLIC_AUTH_PATHS = new Set([
  '/login',
  '/register',
  '/register/verify',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/accept-invite',
  // Portal del vecino (Plan 5): ingreso con documento y canje del enlace mágico
  '/portal/login',
  '/portal/enter',
]);

const ALL_AUTH_PATHS = new Set([...PUBLIC_AUTH_PATHS, '/register/store']);

/** Páginas que cualquiera puede leer, con o sin sesión (política de privacidad del vecino). */
const OPEN_PREFIXES = ['/privacy/'];

const PLATFORM_PREFIX = '/platform';

function normalizePath(path: string): string {
  const withoutBase = path.startsWith('/app/') ? path.slice(4) : path === '/app' ? '/' : path;
  const clean = withoutBase.split('?')[0] ?? '/';
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1);
  return clean || '/';
}

const PORTAL_PREFIX = '/portal';

const isPlatformPath = (path: string) =>
  path === PLATFORM_PREFIX || path.startsWith(`${PLATFORM_PREFIX}/`);

const isPortalPath = (path: string) =>
  path === PORTAL_PREFIX || path.startsWith(`${PORTAL_PREFIX}/`);

/**
 * Decide a qué ruta redirigir según el estado del usuario y la ruta actual.
 * Devuelve `null` cuando el usuario puede permanecer en `path`.
 */
export function nextRouteFor(user: SessionUser | null, path: string): string | null {
  const clean = normalizePath(path);

  if (OPEN_PREFIXES.some((prefix) => clean.startsWith(prefix))) return null;

  if (!user) {
    if (PUBLIC_AUTH_PATHS.has(clean)) return null;
    return isPortalPath(clean) ? '/portal/login' : '/login';
  }

  if (!user.emailVerified) {
    return clean === '/register/verify' ? null : '/register/verify';
  }

  // D8: el portal se abre por el correo verificado, sea cual sea el rol (P2)
  if (isPortalPath(clean)) return clean === '/portal/login' ? PORTAL_PREFIX : null;

  if (user.role === 'CUSTOMER') return PORTAL_PREFIX;

  if (user.role === 'PENDING_OWNER') {
    return clean === '/register/store' ? null : '/register/store';
  }

  // El Administrador de Plataforma solo usa su panel y su perfil
  if (user.role === 'PLATFORM_ADMIN') {
    return isPlatformPath(clean) || clean === '/profile' ? null : PLATFORM_PREFIX;
  }

  if (ALL_AUTH_PATHS.has(clean) || isPlatformPath(clean)) {
    return '/';
  }

  return null;
}

/**
 * Usuario de la sesión, releído de la base en cada petición (una sola vez gracias
 * a `cache`). Devuelve `null` si el usuario o su tienda están dados de baja (US01).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      storeId: users.storeId,
      preferredLocale: users.preferredLocale,
      isActive: users.isActive,
      storeActive: stores.isActive,
    })
    .from(users)
    // LEFT JOIN: el Administrador, el vecino y el dueño pendiente no tienen tienda
    .leftJoin(stores, eq(stores.id, users.storeId))
    .where(eq(users.id, session.user.id));

  if (!row || !row.isActive || !isRole(row.role)) return null;
  if (row.storeId && row.storeActive === false) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    storeId: row.storeId,
    preferredLocale: isLocale(row.preferredLocale) ? row.preferredLocale : 'es',
  };
});

/** Usuario con acceso al panel en `path`; si no corresponde, redirige. */
export async function requireUser(path = '/'): Promise<SessionUser> {
  const user = await getSessionUser();
  const target = nextRouteFor(user, path);
  if (target) redirect(target);
  if (!user) redirect('/login');
  return user;
}
