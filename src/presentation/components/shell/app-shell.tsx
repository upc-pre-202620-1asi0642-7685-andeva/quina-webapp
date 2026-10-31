import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleUserRoundIcon } from 'lucide-react';
import type { StoreUser } from '@/presentation/auth/guards';
import { formatDate } from '@/presentation/lib/format-date';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';
import { bottomItems, sidebarItems } from './nav-items';
import { BottomNav, SidebarNav } from './shell-nav';

export type ShellStore = { name: string; trialEndsAt: Date | null };

/** Marco del panel de la tienda: barra lateral desde 1024 px y barra inferior en celular. */
export async function AppShell({
  user,
  store,
  children,
}: {
  user: StoreUser;
  store: ShellStore;
  children: React.ReactNode;
}) {
  const t = await getTranslations('Shell');
  const trial = store.trialEndsAt ? t('trialUntil', { date: formatDate(store.trialEndsAt) }) : null;

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface p-4 lg:flex">
        <Link href="/" className="px-4 pt-2">
          <Image src={isologo} alt={t('logoAlt')} priority className="h-8 w-auto" />
        </Link>
        <SidebarNav items={sidebarItems(user.role)} />
        <div className="mt-auto flex flex-col gap-3">
          {trial ? (
            <p className="rounded-card bg-soft px-4 py-3 text-sm text-soft-ink">{trial}</p>
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
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <Image src={isologo} alt={t('logoAlt')} className="h-7 w-auto" />
          <span className="truncate text-sm font-medium text-ink">{store.name}</span>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomNav items={bottomItems(user.role)} />
    </div>
  );
}
