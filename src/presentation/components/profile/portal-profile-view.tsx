'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon, BadgeCheckIcon, ChevronRightIcon, StoreIcon } from 'lucide-react';
import { ActiveSessionsCard } from '@/presentation/components/profile/active-sessions-card';
import { LocaleSelectorCard } from '@/presentation/components/profile/locale-selector-card';
import { OfflineSafetyCard } from '@/presentation/components/profile/offline-safety-card';
import { PasswordCard } from '@/presentation/components/profile/password-card';
import { SignOutCard } from '@/presentation/components/profile/sign-out-card';
import { ThemeSelectorCard } from '@/presentation/components/profile/theme-selector-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/presentation/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
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

export function PortalProfileView({
  profile,
  stores,
}: {
  profile: ProfileSummary;
  stores: { storeId: string; storeName: string }[];
}) {
  const t = useTranslations('Profile');

  return (
    <>
      <Link
        href="/portal"
        className="inline-flex min-h-11 items-center gap-2 self-start text-base font-medium text-link-active hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-5" />
        <span>{t('backToPortal')}</span>
      </Link>

      {/* Cabecera amigable del vecino (DESIGN.md §6.2: escala legible) */}
      <header className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 shrink-0 border border-line bg-soft text-base font-semibold text-soft-ink">
            {profile.user.image ? (
              <AvatarImage src={profile.user.image} alt={profile.user.name} />
            ) : null}
            <AvatarFallback className="bg-soft font-semibold text-soft-ink">
              {getInitials(profile.user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">
              {profile.user.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-base text-ink-soft">
              <span className="truncate">{profile.user.email}</span>
              {profile.user.emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-medium text-success-ink">
                  <BadgeCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {t('identity.verified')}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <p className="text-base text-ink-soft">{t('subtitlePortal')}</p>
      </header>

      <Tabs defaultValue="account" className="flex flex-col gap-5">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-field bg-paper-deep p-1">
          <TabsTrigger
            value="account"
            className="min-h-12 rounded-field px-3 text-base font-semibold data-[state=active]:bg-surface data-[state=active]:text-ink"
          >
            {t('portalTabs.account')}
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="min-h-12 rounded-field px-3 text-base font-semibold data-[state=active]:bg-surface data-[state=active]:text-ink"
          >
            {t('portalTabs.security')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="flex flex-col gap-5">
          {stores.length > 0 ? (
            <section
              aria-labelledby="portal-stores-title"
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
            >
              <div className="flex flex-col gap-1">
                <h2 id="portal-stores-title" className="text-xl font-semibold text-ink">
                  {t('portalStores.title')}
                </h2>
                <p className="text-base text-ink-soft">{t('portalStores.subtitle')}</p>
              </div>
              <ul className="divide-y divide-line rounded-field border border-line">
                {stores.map((store) => (
                  <li key={store.storeId}>
                    <Link
                      href={`/portal/${store.storeId}`}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-base font-semibold text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link-active"
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

        <TabsContent value="security" className="flex flex-col gap-5">
          <PasswordCard hasPassword={profile.accounts.hasPassword} variant="portal" />
          <ActiveSessionsCard sessions={profile.sessions} variant="portal" />
          <OfflineSafetyCard variant="portal" />
        </TabsContent>
      </Tabs>
    </>
  );
}
