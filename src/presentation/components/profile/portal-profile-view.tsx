'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BadgeCheckIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  StoreIcon,
  UserRoundIcon,
} from 'lucide-react';
import { ActiveSessionsCard } from '@/presentation/components/profile/active-sessions-card';
import { LocaleSelectorCard } from '@/presentation/components/profile/locale-selector-card';
import { OfflineSafetyCard } from '@/presentation/components/profile/offline-safety-card';
import { PasswordCard } from '@/presentation/components/profile/password-card';
import { SignOutCard } from '@/presentation/components/profile/sign-out-card';
import { ThemeSelectorCard } from '@/presentation/components/profile/theme-selector-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/presentation/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
import { formatDate } from '@/presentation/lib/format-date';
import type { ProfileSummary } from '@/presentation/queries/profile';

function getInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return letters || '?';
}

const triggerClass =
  'inline-flex h-auto min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold whitespace-nowrap text-ink-soft shadow-none transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover hover:text-ink active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100 data-[state=active]:border-soft data-[state=active]:bg-soft data-[state=active]:text-soft-ink data-[state=active]:shadow-none lg:w-full lg:items-start lg:justify-start lg:gap-3 lg:rounded-field lg:border-0 lg:bg-transparent lg:px-3.5 lg:py-3 lg:text-left lg:whitespace-normal lg:data-[state=active]:border-0 lg:data-[state=active]:bg-soft lg:data-[state=active]:text-soft-ink';

export function PortalProfileView({
  profile,
  stores,
  fallbackName = null,
}: {
  profile: ProfileSummary;
  stores: { storeId: string; storeName: string }[];
  fallbackName?: string | null;
}) {
  const t = useTranslations('Profile');
  const displayName =
    profile.user.name.trim() || fallbackName?.trim() || profile.user.email.split('@')[0] || '';
  const storesLabel = stores.map((store) => store.storeName).join(' · ');

  return (
    <>
      {/* Cabecera compartida con Bodega (DESIGN.md §6.2 + ProfileShell) */}
      <header className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-14 shrink-0 border border-line bg-soft text-base font-semibold text-soft-ink sm:size-16 sm:text-lg">
            {profile.user.image ? <AvatarImage src={profile.user.image} alt={displayName} /> : null}
            <AvatarFallback className="bg-soft font-semibold text-soft-ink">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {displayName}
              </h1>
              <span className="inline-flex items-center rounded-full bg-soft px-2.5 py-0.5 text-xs font-medium text-soft-ink">
                {t('roles.CUSTOMER')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
              <span className="truncate">{profile.user.email}</span>
              {profile.user.emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success-ink">
                  <BadgeCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {t('identity.verified')}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-0.5 border-t border-line pt-3 text-xs text-ink-soft sm:border-t-0 sm:pt-0 sm:text-right">
          {storesLabel ? <span className="font-medium text-ink">{storesLabel}</span> : null}
          {profile.user.lastLoginAt ? (
            <span>{t('identity.lastLogin', { date: formatDate(profile.user.lastLoginAt) })}</span>
          ) : null}
          <span>{t('identity.memberSince', { date: formatDate(profile.user.createdAt) })}</span>
        </div>
      </header>

      <Tabs
        defaultValue="account"
        className="flex flex-col gap-6 lg:grid lg:grid-cols-[248px_1fr] lg:items-start lg:gap-8"
      >
        <TabsList
          aria-label={t('nav.ariaLabel')}
          className="-mx-4 flex h-auto snap-x items-stretch justify-start gap-2 overflow-x-auto rounded-none bg-transparent px-4 pb-1 lg:sticky lg:top-8 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-2"
        >
          <TabsTrigger value="account" className={triggerClass}>
            <UserRoundIcon aria-hidden="true" className="size-4 shrink-0 lg:mt-0.5" />
            <span className="flex min-w-0 flex-col">
              <span>{t('portalTabs.account')}</span>
              <span className="hidden text-xs font-normal text-ink-soft lg:block">
                {t('portalTabs.accountHint')}
              </span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="security" className={triggerClass}>
            <ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0 lg:mt-0.5" />
            <span className="flex min-w-0 flex-col">
              <span>{t('portalTabs.security')}</span>
              <span className="hidden text-xs font-normal text-ink-soft lg:block">
                {t('portalTabs.securityHint')}
              </span>
            </span>
          </TabsTrigger>
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="account" className="mt-0 flex flex-col gap-6">
            {stores.length > 0 ? (
              <section
                aria-labelledby="portal-stores-title"
                className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6"
              >
                <div className="flex flex-col gap-1">
                  <h2 id="portal-stores-title" className="text-xl font-semibold text-ink">
                    {t('portalStores.title')}
                  </h2>
                  <p className="text-base text-ink-soft">{t('portalStores.subtitle')}</p>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-field border border-line">
                  {stores.map((store) => (
                    <li key={store.storeId}>
                      <Link
                        href={`/portal/${store.storeId}`}
                        className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-lg font-semibold text-ink transition-[transform,background-color] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link-active active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <StoreIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
                          <span className="truncate">{store.storeName}</span>
                        </span>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="size-5 shrink-0 text-ink-soft"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <ThemeSelectorCard variant="portal" />
            <LocaleSelectorCard currentLocale={profile.user.preferredLocale} variant="portal" />
            <SignOutCard variant="portal" />
          </TabsContent>

          <TabsContent value="security" className="mt-0 flex flex-col gap-6">
            <PasswordCard hasPassword={profile.accounts.hasPassword} variant="portal" />
            <ActiveSessionsCard sessions={profile.sessions} variant="portal" />
            <OfflineSafetyCard variant="portal" />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
