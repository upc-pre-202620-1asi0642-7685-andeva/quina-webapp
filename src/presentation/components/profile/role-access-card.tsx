import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  ClockIcon,
  CreditCardIcon,
  HistoryIcon,
  LandmarkIcon,
  LockIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StoreIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import type { PlanTier, SubscriptionStatus } from '@/core/domain/billing/plan-limits';
import { cn } from '@/presentation/lib/utils';
import type { ProfileAccessContext } from '@/presentation/queries/profile';

type BadgeTone = 'readOnly' | 'pastDue' | 'trial' | 'canceling' | 'active';

const BADGE_STYLES: Record<BadgeTone, string> = {
  readOnly: 'bg-error/12 text-error-ink',
  pastDue: 'bg-amber/12 text-amber-ink',
  trial: 'bg-soft text-soft-ink',
  canceling: 'bg-paper-deep text-ink-soft',
  active: 'bg-success/12 text-success-ink',
};

const BADGE_ICONS: Record<BadgeTone, typeof CircleCheckIcon> = {
  readOnly: LockIcon,
  pastDue: TriangleAlertIcon,
  trial: ClockIcon,
  canceling: CirclePauseIcon,
  active: CircleCheckIcon,
};

function resolveBadgeTone(input: {
  tier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  isReadOnly: boolean;
  trialDaysRemaining: number | null;
}): BadgeTone {
  if (input.isReadOnly) return 'readOnly';
  if (input.subscriptionStatus === 'PAST_DUE') return 'pastDue';
  if (
    input.subscriptionStatus === 'TRIALING' &&
    input.tier !== 'CASERO' &&
    input.trialDaysRemaining !== null
  ) {
    return 'trial';
  }
  if (input.cancelAtPeriodEnd) return 'canceling';
  return 'active';
}

const EMPLOYEE_ALLOWED_KEYS = ['employee1', 'employee2', 'employee3'] as const;
const OWNER_ONLY_KEYS = ['owner1', 'owner2', 'owner3'] as const;

export async function RoleAccessCard({ access }: { access: ProfileAccessContext }) {
  const t = await getTranslations('Profile.access');
  const tTeamRoles = await getTranslations('Team.roles');
  const tPlans = await getTranslations('Plans');
  const tHub = await getTranslations('Settings.hub');
  const tTax = await getTranslations('Settings.tax');
  const tReg = await getTranslations('Register.store.turns');

  if (access.kind === 'owner') {
    const tone = resolveBadgeTone(access);
    const StatusIcon = BADGE_ICONS[tone];
    const statusLabel =
      tone === 'trial'
        ? tHub('subscription.statuses.trial', { days: access.trialDaysRemaining ?? 0 })
        : tHub(`subscription.statuses.${tone}`);

    const links = [
      {
        href: '/settings',
        label: t('ownerLinks.settings.label'),
        meta: t('ownerLinks.settings.meta'),
        icon: SettingsIcon,
      },
      {
        href: '/settings/subscription',
        label: t('ownerLinks.subscription.label'),
        meta: `${tPlans(`names.${access.tier}`)} · ${statusLabel}`,
        icon: CreditCardIcon,
      },
      {
        href: '/team',
        label: t('ownerLinks.team.label'),
        meta:
          access.usersMax === null
            ? tHub('team.unlimited', { used: access.usersUsed })
            : tHub('team.seats', { used: access.usersUsed, max: access.usersMax }),
        icon: UsersIcon,
      },
      {
        href: '/audit',
        label: t('ownerLinks.audit.label'),
        meta: tHub('audit.meta'),
        icon: HistoryIcon,
      },
    ];

    const turnLabel = ['BODEGA', 'BOTICA', 'CARNICERIA', 'PANADERIA', 'OTRO'].includes(
      access.businessTurn,
    )
      ? tReg(access.businessTurn as 'BODEGA' | 'BOTICA' | 'CARNICERIA' | 'PANADERIA' | 'OTRO')
      : access.businessTurn;

    const regimeLabel = ['NUEVO_RUS', 'RER', 'MYPE', 'GENERAL'].includes(access.taxRegime)
      ? tTax(`regimes.${access.taxRegime as 'NUEVO_RUS' | 'RER' | 'MYPE' | 'GENERAL'}`)
      : access.taxRegime;

    return (
      <>
        <section
          aria-labelledby="profile-access-store-title"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-soft-ink">
                <StoreIcon aria-hidden="true" className="size-5" />
              </span>
              <div className="flex flex-col gap-0.5">
                <h2 id="profile-access-store-title" className="text-lg font-semibold text-ink">
                  {access.storeName}
                </h2>
                <p className="text-sm text-ink-soft tabular-nums">
                  {t('storeMeta', {
                    turn: turnLabel,
                    taxIdType: access.taxIdType,
                    taxIdNumber: access.taxIdNumber,
                  })}
                </p>
              </div>
            </div>

            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                BADGE_STYLES[tone],
              )}
            >
              <StatusIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span>
                {tPlans(`names.${access.tier}`)} · {statusLabel}
              </span>
            </span>
          </div>

          <dl className="grid gap-3 rounded-field bg-paper-deep/60 p-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-ink-soft">{t('taxRegimeLabel')}</dt>
              <dd className="text-sm font-semibold text-ink">
                {regimeLabel}
                {access.taxRegime === 'NUEVO_RUS'
                  ? ` · ${t('rusCategory', { category: access.rusCategory })}`
                  : ''}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-ink-soft">{t('teamSeatsLabel')}</dt>
              <dd className="text-sm font-semibold text-ink tabular-nums">
                {access.usersMax === null
                  ? tHub('team.unlimited', { used: access.usersUsed })
                  : tHub('team.seats', { used: access.usersUsed, max: access.usersMax })}
              </dd>
            </div>
          </dl>

          <nav aria-label={t('ownerLinksAria')} className="grid gap-2.5 sm:grid-cols-2">
            {links.map(({ href, label, meta, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-h-14 items-center justify-between gap-3 rounded-field border border-line bg-surface px-4 py-3 transition-colors duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active motion-reduce:transition-none"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-ink-soft group-hover:text-ink"
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-ink">{label}</span>
                    <span className="truncate text-[13px] text-ink-soft tabular-nums">{meta}</span>
                  </div>
                </div>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-ink-soft transition-transform duration-150 ease-(--ease-out-expo) group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transition-none"
                />
              </Link>
            ))}
          </nav>
        </section>

        <section
          aria-labelledby="profile-access-matrix-title"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="profile-access-matrix-title" className="text-lg font-semibold text-ink">
              {t('ownerScopeTitle')}
            </h2>
            <p className="text-sm text-ink-soft">{tTeamRoles('toggleSubtitle')}</p>
          </div>

          <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">{tTeamRoles('ownerHeading')}</h3>
              <ul className="flex flex-col gap-2 text-sm text-ink-soft">
                {OWNER_ONLY_KEYS.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <CheckIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-success-ink"
                    />
                    <span>{tTeamRoles(key)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">{tTeamRoles('employeeHeading')}</h3>
              <ul className="flex flex-col gap-2 text-sm text-ink-soft">
                {EMPLOYEE_ALLOWED_KEYS.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <CheckIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-ink-soft"
                    />
                    <span>{tTeamRoles(key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </>
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
