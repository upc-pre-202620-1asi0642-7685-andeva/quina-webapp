import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ChevronRightIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  ClockIcon,
  CreditCardIcon,
  HistoryIcon,
  LockIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import type { PlanTier, SubscriptionStatus } from '@/core/domain/billing/plan-limits';
import { cn } from '@/presentation/lib/utils';

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

export type StoreHubLinksProps = {
  tier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  isReadOnly: boolean;
  trialDaysRemaining: number | null;
  canManageTeam: boolean;
  usersUsed: number;
  usersMax: number | null;
  canViewAudit: boolean;
};

/** Franja compacta de accesos administrativos desde Ajustes. */
export async function StoreHubLinks({
  tier,
  subscriptionStatus,
  cancelAtPeriodEnd,
  isReadOnly,
  trialDaysRemaining,
  canManageTeam,
  usersUsed,
  usersMax,
  canViewAudit,
}: StoreHubLinksProps) {
  const t = await getTranslations('Settings.hub');
  const tPlans = await getTranslations('Plans');

  const tone = resolveBadgeTone({
    tier,
    subscriptionStatus,
    cancelAtPeriodEnd,
    isReadOnly,
    trialDaysRemaining,
  });
  const StatusIcon = BADGE_ICONS[tone];
  const statusLabel =
    tone === 'trial'
      ? t('subscription.statuses.trial', { days: trialDaysRemaining ?? 0 })
      : t(`subscription.statuses.${tone}`);

  const items: {
    href: string;
    label: string;
    icon: typeof CreditCardIcon;
    meta: React.ReactNode;
  }[] = [
    {
      href: '/settings/subscription',
      label: t('subscription.label'),
      icon: CreditCardIcon,
      meta: (
        <>
          <span className="font-medium text-ink">{tPlans(`names.${tier}`)}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
              BADGE_STYLES[tone],
            )}
          >
            <StatusIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {statusLabel}
          </span>
        </>
      ),
    },
  ];

  if (canManageTeam) {
    items.push({
      href: '/team',
      label: t('team.label'),
      icon: UsersIcon,
      meta: (
        <span className="tabular-nums">
          {usersMax === null
            ? t('team.unlimited', { used: usersUsed })
            : t('team.seats', { used: usersUsed, max: usersMax })}
        </span>
      ),
    });
  }

  if (canViewAudit) {
    items.push({
      href: '/audit',
      label: t('audit.label'),
      icon: HistoryIcon,
      meta: <span>{t('audit.meta')}</span>,
    });
  }

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface lg:grid lg:auto-cols-fr lg:grid-flow-col lg:divide-x lg:divide-y-0"
    >
      {items.map(({ href, label, icon: Icon, meta }) => (
        <Link
          key={href}
          href={href}
          className="group flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm transition-colors duration-150 ease-(--ease-out-expo) first:rounded-t-card last:rounded-b-card hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link-active motion-reduce:transition-none lg:first:rounded-l-card lg:first:rounded-tr-none lg:last:rounded-r-card lg:last:rounded-bl-none"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Icon
              aria-hidden="true"
              className="size-5 shrink-0 text-ink-soft transition-colors group-hover:text-ink motion-reduce:transition-none"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold text-ink">{label}</span>
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft">
                {meta}
              </div>
            </div>
          </div>
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-soft transition-transform duration-150 ease-(--ease-out-expo) group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transition-none"
          />
        </Link>
      ))}
    </nav>
  );
}
