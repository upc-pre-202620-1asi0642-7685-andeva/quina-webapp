import { redirect } from 'next/navigation';
import { countLowStockProducts } from '@/infrastructure/db/queries/catalog';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';
import { AppToaster } from '@/presentation/components/feedback/app-toaster';
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

  const [store, lowStockCount] = await Promise.all([
    loadStoreContext(user.storeId),
    countLowStockProducts(user.storeId),
  ]);
  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;

  return (
    <AppShell
      user={{ name: user.name, role: user.role }}
      store={{
        name: store.name,
        trialEndsAt,
        trialDaysRemaining: store.trialDaysRemaining,
        graceDaysRemaining: store.graceDaysRemaining,
        isReadOnly: store.isReadOnly,
        lowStockCount,
      }}
    >
      {children}
      <AppToaster />
    </AppShell>
  );
}
