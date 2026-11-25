import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  CheckIcon,
  ChevronRightIcon,
  LandmarkIcon,
  LockIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  StoreIcon,
} from 'lucide-react';
import type { ProfileAccessContext } from '@/presentation/queries/profile';

const EMPLOYEE_ALLOWED_KEYS = ['employee1', 'employee2', 'employee3'] as const;
const OWNER_ONLY_KEYS = ['owner1', 'owner2', 'owner3'] as const;

export async function RoleAccessCard({ access }: { access: ProfileAccessContext }) {
  const t = await getTranslations('Profile.access');
  const tTeamRoles = await getTranslations('Team.roles');

  if (access.kind === 'owner') {
    return (
      <section
        aria-labelledby="profile-access-owner-title"
        className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink">
              <ShieldCheckIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 id="profile-access-owner-title" className="text-lg font-semibold text-ink">
                {t('ownerTitle', { store: access.storeName })}
              </h2>
              <p className="text-sm text-ink-soft">{t('ownerSubtitle')}</p>
            </div>
          </div>

          <Link
            href="/team"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active motion-reduce:transition-none"
          >
            <span>{t('manageTeamLink')}</span>
            <ChevronRightIcon aria-hidden="true" className="size-4 text-ink-soft" />
          </Link>
        </div>

        <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <CheckIcon aria-hidden="true" className="size-4 text-success-ink" />
              <span>{tTeamRoles('ownerHeading')}</span>
            </h3>
            <ul className="flex flex-col gap-2 text-sm text-ink-soft">
              {OWNER_ONLY_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success"
                  />
                  <span>{tTeamRoles(key)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <CheckIcon aria-hidden="true" className="size-4 text-ink-soft" />
              <span>{tTeamRoles('employeeHeading')}</span>
            </h3>
            <ul className="flex flex-col gap-2 text-sm text-ink-soft">
              {EMPLOYEE_ALLOWED_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-soft"
                  />
                  <span>{tTeamRoles(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  if (access.kind === 'employee') {
    return (
      <section
        aria-labelledby="profile-access-employee-title"
        className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink">
            <ShieldCheckIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="profile-access-employee-title" className="text-lg font-semibold text-ink">
              {t('employeeTitle', { store: access.storeName })}
            </h2>
            <p className="text-sm text-ink-soft">{t('employeeSubtitle')}</p>
          </div>
        </div>

        <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <CheckIcon aria-hidden="true" className="size-4 text-success-ink" />
              <span>{t('employeeAllowedHeading')}</span>
            </h3>
            <ul className="flex flex-col gap-2 text-sm text-ink-soft">
              {EMPLOYEE_ALLOWED_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success"
                  />
                  <span>{tTeamRoles(key)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <LockIcon aria-hidden="true" className="size-4 text-ink-soft" />
              <span>{t('employeeRestrictedHeading')}</span>
            </h3>
            <ul className="flex flex-col gap-2 text-sm text-ink-soft">
              {OWNER_ONLY_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-soft"
                  />
                  <span>{tTeamRoles(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  if (access.kind === 'platform') {
    const platformLinks = [
      { href: '/platform/stores', label: t('platformLinks.stores'), icon: StoreIcon },
      { href: '/platform/rate-caps', label: t('platformLinks.rateCaps'), icon: LandmarkIcon },
      { href: '/platform/rus-caps', label: t('platformLinks.rusCaps'), icon: ReceiptTextIcon },
    ];

    return (
      <section
        aria-labelledby="profile-access-platform-title"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink">
            <ShieldCheckIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="profile-access-platform-title" className="text-lg font-semibold text-ink">
              {t('platformTitle')}
            </h2>
            <p className="text-sm text-ink-soft">{t('platformSubtitle')}</p>
          </div>
        </div>

        <nav aria-label={t('platformLinksAria')} className="grid gap-2.5 sm:grid-cols-3">
          {platformLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-12 items-center justify-between gap-2 rounded-field border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition-colors duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active motion-reduce:transition-none"
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-ink-soft group-hover:text-ink"
                />
                <span>{label}</span>
              </span>
              <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
            </Link>
          ))}
        </nav>
      </section>
    );
  }

  return null;
}
