import { cache } from 'react';
import { redirect } from 'next/navigation';
import { can, type Permission } from '@/core/domain/identity/permissions';
import type { PortalLink } from '@/core/domain/ports/portal-directory';
import { createPortalDirectory } from '@/infrastructure/db/portal/drizzle-portal-directory';
import { getSessionUser, requireUser, type SessionUser } from '@/presentation/auth/session';

export type PortalUser = { user: SessionUser; links: PortalLink[] };

/** Tiendas del correo verificado, una vez por petición (Plan 5, D1). */
const portalLinksOf = cache((email: string) => createPortalDirectory().linksForEmail(email));

/**
 * Página del portal del vecino. El acceso sale del correo verificado, no del rol
 * (P2); `links` puede venir vacío si ninguna tienda tiene ya ese correo.
 */
export async function requirePortalUser(path: string): Promise<PortalUser> {
  const user = await requireUser(path);
  return { user, links: await portalLinksOf(user.email) };
}

/** Para Server Actions del portal: el vínculo con esa tienda, o null. */
export async function authorizePortal(
  storeId: string,
): Promise<{ user: SessionUser; link: PortalLink } | null> {
  const user = await getSessionUser();
  if (!user?.emailVerified) return null;
  const link = (await portalLinksOf(user.email)).find((l) => l.storeId === storeId);
  return link ? { user, link } : null;
}

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
