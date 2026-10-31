import { redirect } from 'next/navigation';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';
import { AppShell } from '@/presentation/components/shell/app-shell';
import { loadStoreContext } from '@/presentation/queries/store-context';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // El Administrador solo llega aquí por su perfil; cada página aplica su propia guarda
  if (user?.role === 'PLATFORM_ADMIN') return <>{children}</>;

  const target = nextRouteFor(user, '/');
  if (target) redirect(target);
  if (!user?.storeId || (user.role !== 'STORE_OWNER' && user.role !== 'STORE_EMPLOYEE')) {
    redirect('/login');
  }

  const store = await loadStoreContext(user.storeId);
  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;

  return (
    <AppShell
      user={{ ...user, role: user.role, storeId: user.storeId }}
      store={{ name: store.name, trialEndsAt }}
    >
      {children}
    </AppShell>
  );
}
