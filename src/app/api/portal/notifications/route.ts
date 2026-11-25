import { createPortalDirectory } from '@/infrastructure/db/portal/drizzle-portal-directory';
import { getSessionUser } from '@/presentation/auth/session';
import { loadPortalNotifications } from '@/presentation/queries/portal-notifications';

/** Sondeo en vivo de avisos del vecino en el portal. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.emailVerified) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const links = await createPortalDirectory().linksForEmail(user.email);
  const { items } = await loadPortalNotifications(links);
  return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
