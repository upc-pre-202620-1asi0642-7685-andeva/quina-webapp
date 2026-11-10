import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertTriangleIcon, CircleUserRoundIcon } from 'lucide-react';
import type { Role } from '@/core/domain/identity/roles';
import { formatDate } from '@/presentation/lib/format-date';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';
import { bottomItems, sidebarItems } from './nav-items';
import { BottomNav, SidebarNav } from './shell-nav';

export type ShellStore = {
  name: string;
  trialEndsAt: Date | null;
  trialDaysRemaining?: number | null;
  graceDaysRemaining?: number | null;
  isReadOnly?: boolean;
  lowStockCount?: number;
};

/** Marco del panel (tienda o plataforma): barra lateral desde 1024 px y barra inferior en celular. */
export async function AppShell({
  user,
  store,
  children,
}: {
  user: { name: string; role: Role };
  store: ShellStore;
  children: React.ReactNode;
}) {
  const t = await getTranslations('Shell');
  const tDashboard = await getTranslations('Dashboard');
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

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[256px_1fr] print:block">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface p-4 lg:flex print:hidden">
        <Link
          href={user.role === 'PLATFORM_ADMIN' ? '/platform/stores' : '/'}
          className="px-4 pt-2"
        >
          <Image src={isologo} alt={t('logoAlt')} priority className="h-8 w-auto" />
        </Link>
        <SidebarNav items={sidebarItems(user.role, lowStockCount)} />
        <div className="mt-auto flex flex-col gap-3">
          {lowStockCount > 0 ? (
            <Link
              href="/inventory?filter=low"
              className="flex items-center gap-2 rounded-card bg-amber/12 px-4 py-2.5 text-xs font-medium text-amber-ink hover:opacity-90"
            >
              <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />
              <span>{t('lowStockAlert', { count: lowStockCount })}</span>
            </Link>
          ) : null}
          {grace ? (
            <Link
              href="/settings#plans"
              className="rounded-card bg-amber/12 px-4 py-3 text-xs font-medium text-amber-ink hover:opacity-90"
            >
              {grace}
            </Link>
          ) : trial ? (
            <Link
              href="/settings#plans"
              className="rounded-card bg-soft px-4 py-3 text-sm text-soft-ink hover:opacity-90"
            >
              {trial}
            </Link>
          ) : null}
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-full px-4 py-2 text-sm hover:bg-surface-hover"
          >
            <CircleUserRoundIcon aria-hidden="true" className="size-5 text-ink-soft" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{user.name}</span>
              <span className="truncate text-xs text-ink-soft">{store.name}</span>
            </span>
            <span className="sr-only">{tDashboard('profileLink')}</span>
          </Link>
        </div>
      </aside>

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
            {/* En el celular el perfil y el idioma quedan a un toque, también para el dueño */}
            <Link
              href="/profile"
              aria-label={tDashboard('profileLink')}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-hover hover:text-ink"
            >
              <CircleUserRoundIcon aria-hidden="true" className="size-6" />
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          {isReadOnly ? (
            <div
              role="alert"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-error/50 bg-error/12 px-4 py-3 text-sm font-medium text-error-ink print:hidden"
            >
              <span>{t('readOnlyLock')}</span>
              {user.role === 'STORE_OWNER' ? (
                <Link href="/settings#plans" className="font-semibold underline">
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
                <Link href="/settings#plans" className="font-semibold underline">
                  {t('managePlan')}
                </Link>
              ) : null}
            </div>
          ) : trial ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-card bg-soft px-4 py-2.5 text-xs font-medium text-soft-ink lg:hidden print:hidden">
              <span>{trial}</span>
              {user.role === 'STORE_OWNER' ? (
                <Link href="/settings#plans" className="font-semibold underline">
                  {t('managePlan')}
                </Link>
              ) : null}
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <BottomNav items={bottomItems(user.role)} />
    </div>
  );
}
