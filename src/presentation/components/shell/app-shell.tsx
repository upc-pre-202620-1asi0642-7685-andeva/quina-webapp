import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { AlertTriangleIcon } from 'lucide-react';
import { can } from '@/core/domain/identity/permissions';
import type { Role } from '@/core/domain/identity/roles';
import { AppToaster } from '@/presentation/components/feedback/app-toaster';
import { RouteBones } from '@/presentation/components/feedback/page-skeleton';
import { OfflineBanner } from '@/presentation/components/pwa/pwa';
import { formatDate } from '@/presentation/lib/format-date';
import type { AppNotification } from '@/presentation/queries/notifications';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';
import { Breadcrumbs } from './breadcrumbs';
import { mobileTabs, navGroups, quickActions, secondaryItems, SIDEBAR_COOKIE } from './nav-items';
import { NotificationsMenu, ProfileMenu } from './shell-menus';
import { MobileNav, Sidebar } from './shell-nav';

export type ShellStore = {
  name: string;
  trialEndsAt: Date | null;
  trialDaysRemaining?: number | null;
  graceDaysRemaining?: number | null;
  isReadOnly?: boolean;
  lowStockCount?: number;
  overdueCount?: number;
};

/** Marco del panel (tienda o plataforma): barra lateral desde 1024 px y barra inferior en celular. */
export async function AppShell({
  user,
  store,
  notifications = [],
  children,
}: {
  user: { name: string; email: string; role: Role };
  store: ShellStore;
  notifications?: AppNotification[];
  children: React.ReactNode;
}) {
  const t = await getTranslations('Shell');
  // La barra plegada se pinta igual desde el servidor: sin salto al hidratar
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';
  const isPlatform = user.role === 'PLATFORM_ADMIN';
  const trial =
    store.trialDaysRemaining !== undefined && store.trialDaysRemaining !== null
      ? t('trialDays', { days: store.trialDaysRemaining })
      : store.trialEndsAt
        ? t('trialUntil', { date: formatDate(store.trialEndsAt) })
        : null;
  const grace =
    store.graceDaysRemaining !== undefined && store.graceDaysRemaining !== null
      ? t('graceDays', { days: store.graceDaysRemaining })
      : null;
  const isReadOnly = Boolean(store.isReadOnly);
  const lowStockCount = store.lowStockCount ?? 0;
  const groups = navGroups(user.role, lowStockCount, store.overdueCount ?? 0);
  const secondary = secondaryItems(user.role);
  const { tabs, sell } = mobileTabs(user.role);

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[auto_1fr] print:block">
      <Sidebar
        initialCollapsed={collapsed}
        groups={groups}
        secondary={secondary}
        quick={quickActions(user.role)}
        notifications={notifications}
        user={{
          name: user.name,
          email: user.email,
          canManageStore: can(user.role, 'settings.billing'),
          homeHref: isPlatform ? '/platform/stores' : '/',
        }}
        store={{
          name: store.name,
          status: grace ?? trial,
          statusTone: grace ? 'grace' : trial ? 'trial' : null,
          isPlatform,
        }}
      />

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur lg:hidden print:hidden">
          <Image src={isologo} alt={t('logoAlt')} className="h-7 w-auto" />
          <div className="flex min-w-0 items-center gap-2">
            {lowStockCount > 0 ? (
              <Link
                href="/inventory?filter=low"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber/12 px-2.5 py-1 text-xs font-medium text-amber-ink tabular-nums"
              >
                <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
                <span>{t('lowStockShort', { count: lowStockCount })}</span>
              </Link>
            ) : null}
            <span className="truncate text-sm font-medium text-ink">{store.name}</span>
            {/* En el celular avisos y cuenta quedan a un toque, como en escritorio */}
            <NotificationsMenu items={notifications} compact />
            <div className="-mr-1.5">
              <ProfileMenu
                user={user}
                storeName={store.name}
                canManageStore={can(user.role, 'settings.billing')}
                compact
              />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] lg:px-8 lg:pt-8 lg:pb-12">
          {isReadOnly ? (
            <div
              role="alert"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-error/50 bg-error/12 px-4 py-3 text-sm font-medium text-error-ink print:hidden"
            >
              <span>{t('readOnlyLock')}</span>
              {user.role === 'STORE_OWNER' ? (
                <Link href="/settings/subscription" className="font-semibold underline">
                  {t('managePlan')}
                </Link>
              ) : null}
            </div>
          ) : grace ? (
            <div
              role="status"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber/25 bg-amber/12 px-4 py-3 text-sm text-amber-ink lg:hidden print:hidden"
            >
              <span>{grace}</span>
              {user.role === 'STORE_OWNER' ? (
                <Link href="/settings/subscription" className="font-semibold underline">
                  {t('managePlan')}
                </Link>
              ) : null}
            </div>
          ) : trial ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-card bg-soft px-4 py-2.5 text-xs font-medium text-soft-ink lg:hidden print:hidden">
              <span>{trial}</span>
              {user.role === 'STORE_OWNER' ? (
                <Link href="/settings/subscription" className="font-semibold underline">
                  {t('managePlan')}
                </Link>
              ) : null}
            </div>
          ) : null}
          <OfflineBanner />
          <Breadcrumbs groups={groups} secondary={secondary} />
          <RouteBones>{children}</RouteBones>
        </main>
      </div>

      <MobileNav
        groups={groups}
        secondary={secondary}
        tabs={tabs}
        sell={sell}
        user={{ name: user.name, storeName: store.name }}
      />
      <AppToaster />
    </div>
  );
}
