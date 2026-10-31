'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  EllipsisIcon,
  HouseIcon,
  SettingsIcon,
  ShoppingBasketIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/presentation/lib/utils';
import type { NavItem, NavKey } from './nav-items';

const ICONS: Record<NavKey, LucideIcon> = {
  home: HouseIcon,
  sell: ShoppingBasketIcon,
  customers: UsersIcon,
  team: UserCogIcon,
  settings: SettingsIcon,
  more: EllipsisIcon,
};

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('Shell.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        if (item.soon) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              className="flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink-soft"
            >
              <Icon aria-hidden="true" />
              {t(item.key)}
              <span className="ml-auto rounded-full bg-paper-deep px-2 py-0.5 text-xs">
                {t('soon')}
              </span>
            </span>
          );
        }
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-link-active',
              active ? 'bg-soft text-soft-ink' : 'text-ink hover:bg-surface-hover',
            )}
          >
            <Icon aria-hidden="true" />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('Shell.nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-2">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          if (item.key === 'sell') {
            return (
              <li key={item.key} className="flex flex-1 justify-center py-1.5">
                <span
                  aria-disabled={item.soon ? 'true' : undefined}
                  className={cn(
                    'flex h-14 min-w-14 flex-col items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-dark',
                    item.soon && 'opacity-60',
                  )}
                >
                  <Icon aria-hidden="true" />
                  {item.soon ? t('soon') : t(item.key)}
                </span>
              </li>
            );
          }
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium outline-none select-none focus-visible:outline-2 focus-visible:outline-link-active',
                  active ? 'text-link-active' : 'text-ink-soft',
                )}
              >
                <Icon aria-hidden="true" />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
