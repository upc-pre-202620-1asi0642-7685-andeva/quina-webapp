import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { isRole, type Role } from '@/core/domain/identity/roles';
import type { Locale } from '@/core/domain/shared/locale';
import { getAuth } from '@/infrastructure/auth/auth';
import { db } from '@/infrastructure/db/connection';
import { users } from '@/infrastructure/db/schema';
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
]);

const ALL_AUTH_PATHS = new Set([...PUBLIC_AUTH_PATHS, '/register/store']);

function normalizePath(path: string): string {
  const withoutBase = path.startsWith('/app/') ? path.slice(4) : path === '/app' ? '/' : path;
  const clean = withoutBase.split('?')[0] ?? '/';
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1);
  return clean || '/';
}

/**
 * Decide a qué ruta redirigir según el estado del usuario y la ruta actual.
 * Devuelve `null` cuando el usuario puede permanecer en `path`.
 */
export function nextRouteFor(user: SessionUser | null, path: string): string | null {
  const clean = normalizePath(path);

  if (!user) {
    return PUBLIC_AUTH_PATHS.has(clean) ? null : '/login';
  }

  if (!user.emailVerified) {
    return clean === '/register/verify' ? null : '/register/verify';
  }

  if (user.role === 'PENDING_OWNER') {
    return clean === '/register/store' ? null : '/register/store';
  }

  if (ALL_AUTH_PATHS.has(clean)) {
    return '/';
  }

  return null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
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
    })
    .from(users)
    .where(eq(users.id, session.user.id));

  if (!row || !row.isActive || !isRole(row.role)) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    storeId: row.storeId,
    preferredLocale: isLocale(row.preferredLocale) ? row.preferredLocale : 'es',
  };
}

export async function requireOwner(): Promise<SessionUser & { storeId: string }> {
  const user = await getSessionUser();
  const target = nextRouteFor(user, '/');
  if (target) redirect(target);
  if (!user || user.role !== 'STORE_OWNER' || !user.storeId) {
    redirect('/login');
  }
  return { ...user, storeId: user.storeId };
}
