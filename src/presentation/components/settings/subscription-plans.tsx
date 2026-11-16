'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckIcon, LockIcon } from 'lucide-react';
import { sileo } from 'sileo';
import {
  PLAN_PRICES,
  PLAN_TIERS,
  PlanLimits,
  type BillingInterval,
  type CountedResource,
  type Feature,
  type PaidPlanTier,
  type PlanTier,
  type SubscriptionStatus,
} from '@/core/domain/billing/plan-limits';
import {
  simulateLocalSubscriptionPaymentAction,
  startSubscriptionCheckoutAction,
} from '@/presentation/actions/billing';
import { formatMoney } from '@/presentation/components/money';
import { Button } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

type LocalCheckoutState = {
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
  preapprovalId: string | null;
} | null;

const FEATURES: Feature[] = [
  'automaticNotifications',
  'receipts',
  'kardexAverageCost',
  'reportsExport',
  'ai',
];

export function SubscriptionPlans({
  currentTier,
  subscriptionStatus,
  billingInterval: currentInterval,
  cancelAtPeriodEnd,
  isReadOnly,
  usage,
  initialLocalCheckout = null,
}: {
  currentTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  cancelAtPeriodEnd: boolean;
  isReadOnly: boolean;
  usage: Record<CountedResource, number>;
  initialLocalCheckout?: LocalCheckoutState;
}) {
  const t = useTranslations('Settings');
  const tPlans = useTranslations('Plans');
  const router = useRouter();
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>(
    currentInterval ?? 'MONTHLY',
  );
  const [busyTier, setBusyTier] = useState<PaidPlanTier | null>(null);
  const [localCheckout, setLocalCheckout] = useState<LocalCheckoutState>(initialLocalCheckout);
  const [isPending, startTransition] = useTransition();

  // DESIGN.md §7.3: el resultado del pago se avisa con Sileo
  const setNotice = (notice: { tone: 'success' | 'warning' | 'error'; message: string } | null) => {
    if (notice) sileo[notice.tone]({ title: notice.message });
  };

  const unlimited = (max: number | null) => (max === null ? tPlans('unlimited') : String(max));

  // DESIGN.md §7.1: una sola acción principal verde por pantalla
  const recommendedTier: PaidPlanTier | null = isReadOnly
    ? PlanLimits.upgradeForUsage(usage)
    : subscriptionStatus === 'ACTIVE' && currentTier === 'BODEGA_PRO'
      ? 'NEGOCIO_PLUS'
      : subscriptionStatus === 'ACTIVE' && currentTier === 'NEGOCIO_PLUS' && !cancelAtPeriodEnd
        ? null
        : 'BODEGA_PRO';

  const handleCheckout = (tier: PaidPlanTier) => {
    setNotice(null);
    setBusyTier(tier);
    startTransition(async () => {
      const result = await startSubscriptionCheckoutAction({
        planTier: tier,
        billingInterval: selectedInterval,
      });
      setBusyTier(null);
      if (!result.ok) {
        setNotice({ tone: 'error', message: t('billingNotice.checkoutError') });
        return;
      }
      try {
        const parsed = new URL(result.checkoutUrl);
        if (parsed.searchParams.get('mp_checkout') === 'local') {
          setLocalCheckout({
            planTier: (parsed.searchParams.get('plan') as PaidPlanTier) ?? tier,
            billingInterval:
              (parsed.searchParams.get('interval') as BillingInterval) ?? selectedInterval,
            preapprovalId: parsed.searchParams.get('preapproval_id'),
          });
          return;
        }
      } catch {
        // Redirección normal
      }
      window.location.assign(result.checkoutUrl);
    });
  };

  const handleSimulateLocal = (outcome: 'approved' | 'rejected') => {
    if (!localCheckout) return;
    setNotice(null);
    startTransition(async () => {
      const result = await simulateLocalSubscriptionPaymentAction({
        planTier: localCheckout.planTier,
        billingInterval: localCheckout.billingInterval,
        outcome,
        preapprovalId: localCheckout.preapprovalId,
      });
      setLocalCheckout(null);
      if (!result.ok) {
        setNotice({ tone: 'error', message: t('billingNotice.checkoutError') });
        return;
      }
      setNotice({
        tone: result.status === 'APPROVED' ? 'success' : 'warning',
        message:
          result.status === 'APPROVED' ? t('billingNotice.approved') : t('billingNotice.rejected'),
      });
      router.replace('/settings/subscription');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {localCheckout ? (
        <div
          role="region"
          aria-labelledby="local-checkout-title"
          className="flex flex-col gap-3 rounded-card border border-primary bg-surface p-4 sm:p-5"
        >
          <div className="flex flex-col gap-1">
            <h3 id="local-checkout-title" className="font-semibold text-ink">
              {t('localCheckout.title')}
            </h3>
            <p className="text-sm text-ink-soft">
              {t('localCheckout.subtitle', {
                plan: tPlans(`names.${localCheckout.planTier}`),
                interval: tPlans(`intervals.${localCheckout.billingInterval}`),
                amount: PlanLimits.planPriceFor(
                  localCheckout.planTier,
                  localCheckout.billingInterval,
                ),
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={isPending}
              onClick={() => handleSimulateLocal('approved')}
            >
              {isPending ? t('localCheckout.processing') : t('localCheckout.approve')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => handleSimulateLocal('rejected')}
            >
              {t('localCheckout.reject')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t('intervalLabel')}
          className="inline-flex rounded-full border border-line bg-paper-deep p-1"
        >
          <button
            type="button"
            aria-pressed={selectedInterval === 'MONTHLY'}
            onClick={() => setSelectedInterval('MONTHLY')}
            className={cn(
              'min-h-11 cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
              selectedInterval === 'MONTHLY'
                ? 'bg-surface text-ink'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            {tPlans('intervals.MONTHLY')}
          </button>
          <button
            type="button"
            aria-pressed={selectedInterval === 'YEARLY'}
            onClick={() => setSelectedInterval('YEARLY')}
            className={cn(
              'min-h-11 cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
              selectedInterval === 'YEARLY'
                ? 'bg-surface text-ink'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            {tPlans('intervals.YEARLY')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_TIERS.map((tier) => {
          const plan = PlanLimits.of(tier);
          const price = PLAN_PRICES[tier];
          const isPaidActiveSamePlan =
            tier === currentTier &&
            subscriptionStatus === 'ACTIVE' &&
            currentInterval === selectedInterval &&
            !cancelAtPeriodEnd;
          const isCurrentBadge = tier === currentTier;
          const isRecommended = tier !== 'CASERO' && tier === recommendedTier;
          const displayAmount =
            tier === 'CASERO'
              ? price.monthly
              : selectedInterval === 'YEARLY'
                ? price.annual!
                : price.monthly;

          return (
            <article
              key={tier}
              className={cn(
                'flex flex-col justify-between gap-5 rounded-card border bg-surface p-4 sm:p-5',
                isCurrentBadge
                  ? 'border-primary'
                  : isRecommended
                    ? 'border-link-active/50'
                    : 'border-line',
              )}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-ink">{tPlans(`names.${tier}`)}</h3>
                  {isCurrentBadge ? (
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[13px] font-medium text-success-ink dark:bg-success/12">
                      {t('yourPlan')}
                    </span>
                  ) : isRecommended ? (
                    <span className="rounded-full bg-soft px-2.5 py-0.5 text-[13px] font-medium text-soft-ink">
                      {t('recommended')}
                    </span>
                  ) : null}
                </div>

                <div>
                  <p className="text-ink">
                    <span className="text-2xl font-semibold tabular-nums">
                      {formatMoney(displayAmount, 'PEN')}
                    </span>
                    <span className="text-sm text-ink-soft">
                      {' '}
                      {tier === 'CASERO' || selectedInterval === 'MONTHLY'
                        ? tPlans('perMonth')
                        : tPlans('perYear')}
                    </span>
                  </p>
                  {price.annual ? (
                    <p className="mt-1 text-[13px] text-ink-soft tabular-nums">
                      {selectedInterval === 'YEARLY'
                        ? tPlans('annualSavings', {
                            monthly: formatMoney((Number(price.annual) / 12).toFixed(2), 'PEN'),
                          })
                        : tPlans('annual', { price: formatMoney(price.annual, 'PEN') })}
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-ink-soft">{tPlans('freeForever')}</p>
                  )}
                </div>

                <ul className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm text-ink tabular-nums">
                  <li>
                    {tPlans('limits.activeCreditCustomers', {
                      max: unlimited(plan.activeCreditCustomers),
                    })}
                  </li>
                  <li>{tPlans('limits.users', { max: unlimited(plan.users) })}</li>
                  <li>{tPlans('limits.products', { max: unlimited(plan.products) })}</li>
                  <li>
                    {tPlans('limits.receiptsPerMonth', { max: unlimited(plan.receiptsPerMonth) })}
                  </li>
                  <li>
                    {tPlans('limits.aiQueriesPerMonth', { max: unlimited(plan.aiQueriesPerMonth) })}
                  </li>
                </ul>

                <ul className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
                  {FEATURES.map((feature) => {
                    const enabled = plan.features[feature];
                    return (
                      <li key={feature} className="flex items-start gap-2">
                        {enabled ? (
                          <CheckIcon
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-success-ink"
                          />
                        ) : (
                          <LockIcon
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-ink-soft"
                          />
                        )}
                        <span className={enabled ? 'text-ink' : 'text-ink-soft'}>
                          {tPlans(`features.${feature}`)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {tier !== 'CASERO' ? (
                <Button
                  type="button"
                  variant={!isPaidActiveSamePlan && isRecommended ? 'primary' : 'secondary'}
                  disabled={isPending || isPaidActiveSamePlan}
                  onClick={() => handleCheckout(tier)}
                  className="w-full"
                >
                  {busyTier === tier && isPending
                    ? t('subscribing')
                    : isPaidActiveSamePlan
                      ? t('yourPlan')
                      : t('subscribe', { plan: tPlans(`names.${tier}`) })}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
