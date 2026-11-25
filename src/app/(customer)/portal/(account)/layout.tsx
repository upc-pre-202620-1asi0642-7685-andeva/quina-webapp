import { cookies } from 'next/headers';
import { requirePortalUser } from '@/presentation/auth/guards';
import { PortalShell } from '@/presentation/components/portal/portal-shell';
import { SIDEBAR_COOKIE } from '@/presentation/components/shell/nav-items';
import { loadPortalNotifications } from '@/presentation/queries/portal-notifications';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [{ user, links }, cookieStore] = await Promise.all([
    requirePortalUser('/portal'),
    cookies(),
  ]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === 'collapsed';
  const { accounts, items } = await loadPortalNotifications(links);
  const stores = accounts.map((a) => ({
    storeId: a.storeId,
    storeName: a.storeName,
    customerName: a.customerName,
  }));
  const displayName =
    user.name.trim() || accounts[0]?.customerName?.trim() || user.email.split('@')[0] || '';

  return (
    <PortalShell
      initialCollapsed={collapsed}
      user={{ name: displayName, email: user.email }}
      stores={stores}
      notifications={items}
    >
      {children}
    </PortalShell>
  );
}
