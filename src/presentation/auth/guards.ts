import { redirect } from 'next/navigation';
import { can, type Permission } from '@/core/domain/identity/permissions';
import { getSessionUser, requireUser, type SessionUser } from '@/presentation/auth/session';

/** Dueño o empleado con su tienda. */
export type StoreUser = SessionUser & {
  role: 'STORE_OWNER' | 'STORE_EMPLOYEE';
  storeId: string;
};

export type PlatformAdmin = SessionUser & { role: 'PLATFORM_ADMIN' };

function isStoreUser(user: SessionUser | null): user is StoreUser {
  return (
    !!user &&
    !!user.storeId &&
    (user.role === 'STORE_OWNER' || user.role === 'STORE_EMPLOYEE') &&
    user.emailVerified
  );
}

/**
 * Página del panel de la tienda. Sin el permiso, vuelve al inicio: el empleado
 * no ve lo que su rol no permite (US05).
 */
export async function requireStoreUser(path: string, permission?: Permission): Promise<StoreUser> {
  const user = await requireUser(path);
  if (!isStoreUser(user)) redirect('/login');
  if (permission && !can(user.role, permission)) redirect('/');
  return user;
}

export async function requirePlatformAdmin(path: string): Promise<PlatformAdmin> {
  const user = await requireUser(path);
  if (user.role !== 'PLATFORM_ADMIN') redirect('/');
  return user as PlatformAdmin;
}

/**
 * Para Server Actions (US05 crit. 4): el rol se verifica en el servidor antes de
 * cualquier mutación. Devuelve `null` si no hay sesión válida o falta el permiso.
 */
export async function authorizeStore(permission: Permission): Promise<StoreUser | null> {
  const user = await getSessionUser();
  if (!isStoreUser(user) || !can(user.role, permission)) return null;
  return user;
}

export async function authorizePlatform(): Promise<PlatformAdmin | null> {
  const user = await getSessionUser();
  if (!user || user.role !== 'PLATFORM_ADMIN' || !user.emailVerified) return null;
  return user as PlatformAdmin;
}
