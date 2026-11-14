import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';
import { loadStoreNotifications } from '@/presentation/queries/notifications';

/** Sondeo del panel de avisos: la campana se actualiza sin recargar la pantalla. */
export async function GET() {
  const user = await getSessionUser();
  if (
    !user?.storeId ||
    (user.role !== 'STORE_OWNER' && user.role !== 'STORE_EMPLOYEE') ||
    nextRouteFor(user, '/')
  ) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { items, overdueCount } = await loadStoreNotifications(user.storeId, user.role);
  return Response.json({ items, overdueCount }, { headers: { 'Cache-Control': 'no-store' } });
}
