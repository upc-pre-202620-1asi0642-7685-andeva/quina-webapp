import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser, nextRouteFor } from '@/presentation/auth/session';
import { AppShell } from '@/presentation/components/shell/app-shell';
import { loadStoreNotifications } from '@/presentation/queries/notifications';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // El Administrador solo llega aquí por su perfil: conserva el mismo marco AppShell de plataforma
  if (user?.role === 'PLATFORM_ADMIN') {
    const tPlatform = await getTranslations('Platform');
    return (
      <AppShell
        user={{ name: user.name, email: user.email, role: user.role }}
        store={{ name: tPlatform('shellName'), trialEndsAt: null }}
      >
        {children}
      </AppShell>
    );
  }

  const target = nextRouteFor(user, '/');
  if (target) redirect(target);
  if (!user?.storeId || (user.role !== 'STORE_OWNER' && user.role !== 'STORE_EMPLOYEE')) {
    redirect('/login');
  }

  const { store, lowStockCount, ...notifications } = await loadStoreNotifications(
    user.storeId,
    user.role,
  );
  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      store={{
        name: store.name,
        trialEndsAt,
        trialDaysRemaining: store.trialDaysRemaining,
        graceDaysRemaining: store.graceDaysRemaining,
        isReadOnly: store.isReadOnly,
        lowStockCount,
        overdueCount: notifications.overdueCount,
      }}
      notifications={notifications.items}
    >
      {children}
    </AppShell>
  );
}
