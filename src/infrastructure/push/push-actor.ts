import { createPortalDirectory } from '@/infrastructure/db/portal/drizzle-portal-directory';
import { getSessionUser, nextRouteFor, type SessionUser } from '@/presentation/auth/session';

export type PushActor =
  | { kind: 'store'; user: SessionUser; storeIds: [string] }
  | { kind: 'portal'; user: SessionUser; storeIds: string[] };

/**
 * Resuelve quién gestiona avisos push: personal de tienda (`storeId`) o
 * vecino verificado del portal conectado a sus tiendas por correo.
 */
export async function resolvePushActor(): Promise<PushActor | null> {
  const user = await getSessionUser();
  if (!user || !user.emailVerified) return null;

  if (
    user.storeId &&
    (user.role === 'STORE_OWNER' || user.role === 'STORE_EMPLOYEE') &&
    !nextRouteFor(user, '/')
  ) {
    return { kind: 'store', user, storeIds: [user.storeId] };
  }

  if (nextRouteFor(user, '/portal')) return null;
  const links = await createPortalDirectory().linksForEmail(user.email);
  return {
    kind: 'portal',
    user,
    storeIds: [...new Set(links.map((link) => link.storeId))],
  };
}
