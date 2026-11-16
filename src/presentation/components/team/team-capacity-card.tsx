import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { GemIcon } from 'lucide-react';
import type { CountedResource, PlanTier } from '@/core/domain/billing/plan-limits';
import { Notice } from '@/presentation/components/notice';
import { cn } from '@/presentation/lib/utils';

export async function TeamCapacityCard({
  tier,
  seats,
  max,
  activeCount,
  invitedCount,
  deactivatedCount,
  isReadOnly,
  overLimitResources,
  upgradeTier,
}: {
  tier: PlanTier;
  seats: number;
  max: number | null;
  activeCount: number;
  invitedCount: number;
  deactivatedCount: number;
  isReadOnly: boolean;
  overLimitResources: CountedResource[];
  upgradeTier: PlanTier | null;
}) {
  const t = await getTranslations('Team');
  const tPlans = await getTranslations('Plans');

  const percent = max === null || max === 0 ? 0 : Math.min(100, Math.round((seats / max) * 100));
  const usersOverLimit = overLimitResources.includes('users');
  const barTone =
    max !== null && seats > max
      ? 'bg-error'
      : max !== null && (seats >= max || percent >= 85)
        ? 'bg-amber'
        : 'bg-primary';
  const planName = tPlans(`names.${tier}`);

  return (
    <div className="flex flex-col gap-4">
      {isReadOnly ? (
        <Notice tone="error">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">
              {usersOverLimit ? t('capacity.readOnlyUsersTitle') : t('capacity.readOnlyOtherTitle')}
            </p>
            <p>
              {usersOverLimit && max !== null
                ? t('capacity.readOnlyUsersBody', { seats, max, plan: planName })
                : t('capacity.readOnlyOtherBody', { plan: planName })}
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="w-fit font-semibold underline underline-offset-4"
          >
            {tPlans('seePlans')}
          </Link>
        </Notice>
      ) : null}

      <section
        aria-labelledby="team-capacity-title"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="team-capacity-title" className="text-lg font-semibold text-ink tabular-nums">
              {max === null ? t('usageUnlimited', { seats }) : t('usage', { seats, max })}
            </h2>
            {!isReadOnly && max !== null && seats >= max && upgradeTier ? (
              <p className="text-sm text-ink-soft">
                {tier === 'CASERO' ? t('locked.caseroTitle') : t('locked.fullTitle')}
                {' · '}
                {t('locked.body', { plan: tPlans(`names.${upgradeTier}`) })}{' '}
                <Link
                  href="/settings/subscription"
                  className="font-medium text-link-active underline-offset-4 hover:underline"
                >
                  {tPlans('seePlans')}
                </Link>
              </p>
            ) : !isReadOnly && max !== null && percent >= 85 ? (
              <p className="text-sm font-medium text-amber-ink">{t('capacity.nearLimit')}</p>
            ) : null}
          </div>

          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap',
              tier === 'CASERO' ? 'bg-paper-deep text-ink-soft' : 'bg-soft text-soft-ink',
            )}
          >
            <GemIcon aria-hidden="true" className="size-4 shrink-0" />
            {t('capacity.planBadge', { plan: planName })}
          </span>
        </div>

        {max !== null ? (
          <div
            role="meter"
            aria-label={t('capacity.meterLabel')}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={seats}
            aria-valuetext={t('usage', { seats, max })}
            className="h-2.5 overflow-hidden rounded-full bg-paper-deep"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-250 ease-(--ease-out-expo) motion-reduce:transition-none',
                barTone,
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}

        <ul className="flex flex-wrap items-center gap-2">
          <li className="inline-flex items-center rounded-full bg-success/12 px-2.5 py-1 text-[13px] font-medium text-success-ink tabular-nums">
            {t('capacity.activeChip', { count: activeCount })}
          </li>
          <li className="inline-flex items-center rounded-full bg-amber/12 px-2.5 py-1 text-[13px] font-medium text-amber-ink tabular-nums">
            {t('capacity.invitedChip', { count: invitedCount })}
          </li>
          <li className="inline-flex items-center rounded-full bg-paper-deep px-2.5 py-1 text-[13px] font-medium text-ink-soft tabular-nums">
            {t('capacity.deactivatedChip', { count: deactivatedCount })}
          </li>
        </ul>
      </section>
    </div>
  );
}
