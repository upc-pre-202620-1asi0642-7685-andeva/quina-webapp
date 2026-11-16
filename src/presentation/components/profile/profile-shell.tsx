'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BadgeCheckIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  StoreIcon,
  UserCogIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/core/domain/identity/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/presentation/components/ui/avatar';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

type NavTab = {
  href: string;
  key: 'account' | 'security' | 'preferences' | 'access';
  icon: LucideIcon;
};

const TABS: NavTab[] = [
  { href: '/profile', key: 'account', icon: UserRoundIcon },
  { href: '/profile/security', key: 'security', icon: ShieldCheckIcon },
  { href: '/profile/preferences', key: 'preferences', icon: SlidersHorizontalIcon },
  { href: '/profile/access', key: 'access', icon: UserCogIcon },
];

function getInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return letters || '?';
}

const press =
  'transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100';
const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active';

export function ProfileShell({
  user,
  contextLabel,
  children,
}: {
  user: {
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    role: Role;
    createdAt: Date | string;
    lastLoginAt: Date | string | null;
  };
  contextLabel: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('Profile');
  const pathname = usePathname();
  const createdAt = new Date(user.createdAt);
  const lastLoginAt = user.lastLoginAt ? new Date(user.lastLoginAt) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Cabecera de identidad: quién eres, rol y tienda/plataforma */}
      <header className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-14 shrink-0 border border-line bg-soft text-base font-semibold text-soft-ink sm:size-16 sm:text-lg">
            {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
            <AvatarFallback className="bg-soft font-semibold text-soft-ink">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">
                {user.name}
              </h1>
              <span className="inline-flex items-center rounded-full bg-soft px-2.5 py-0.5 text-xs font-semibold text-soft-ink">
                {t(`roles.${user.role}`)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-soft">
              <span className="truncate">{user.email}</span>
              {user.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success-ink">
                  <BadgeCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {t('identity.verified')}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[13px] text-ink-soft sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <StoreIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
            <span className="truncate">{contextLabel}</span>
          </span>
          <span className="tabular-nums">
            {lastLoginAt
              ? t('identity.lastLogin', { date: formatDate(lastLoginAt) })
              : t('identity.memberSince', { date: formatDate(createdAt) })}
          </span>
        </div>
      </header>

      {/* Navegación móvil: píldoras horizontales accesibles sin desbordar 390px */}
      <nav
        aria-label={t('nav.ariaLabel')}
        className="-mx-4 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-sm font-medium',
                active
                  ? 'border-soft bg-soft text-soft-ink'
                  : 'border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                press,
                focusRing,
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{t(`nav.${key}.label`)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Escritorio: riel lateral fijo + panel de contenido */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[248px_1fr] lg:items-start lg:gap-8">
        <aside className="hidden lg:sticky lg:top-8 lg:block">
          <nav
            aria-label={t('nav.ariaLabel')}
            className="flex flex-col gap-1 rounded-card border border-line bg-surface p-2"
          >
            {TABS.map(({ href, key, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-12 items-start gap-3 rounded-field px-3 py-2.5 text-sm',
                    active
                      ? 'bg-soft text-soft-ink'
                      : 'text-ink-soft hover:bg-surface-hover hover:text-ink',
                    press,
                    focusRing,
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 size-5 shrink-0',
                      active ? 'text-soft-ink' : 'text-ink-soft',
                    )}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn('font-semibold', active ? 'text-soft-ink' : 'text-ink')}>
                      {t(`nav.${key}.label`)}
                    </span>
                    <span
                      className={cn(
                        'text-[13px] leading-snug',
                        active ? 'text-soft-ink-2' : 'text-ink-soft',
                      )}
                    >
                      {t(`nav.${key}.hint`)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
