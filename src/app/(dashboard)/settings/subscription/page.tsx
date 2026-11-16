import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ReceiptTextIcon } from 'lucide-react';
import {
  BILLING_INTERVALS,
  PAID_PLAN_TIERS,
  PlanLimits,
  type BillingInterval,
  type CountedResource,
  type PaidPlanTier,
  type SubscriptionStatus,
} from '@/core/domain/billing/plan-limits';
import { loadMonthlyFeatureUsage } from '@/infrastructure/db/queries/plan-usage';
import { listSubscriptionPayments } from '@/infrastructure/db/queries/subscriptions';
import { isLocalMpTransport } from '@/infrastructure/payments/mercado-pago-subscription-gateway';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { CancelRenewalDialog } from '@/presentation/components/settings/cancel-renewal-dialog';
import { SubscriptionPlans } from '@/presentation/components/settings/subscription-plans';
import { SubscriptionStatusBadge } from '@/presentation/components/settings/subscription-status-badge';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

const RESOURCES: CountedResource[] = ['activeCreditCustomers', 'users', 'products'];
const MONTHLY_QUOTAS = ['receiptsPerMonth', 'aiQueriesPerMonth'] as const;

const RESOURCE_HREF: Record<CountedResource, string> = {
  activeCreditCustomers: '/customers',
  users: '/team',
  products: '/inventory',
};

function resolveBillingReturnNotice(
  billing: string | undefined,
  status: string | undefined,
  collectionStatus: string | undefined,
): { tone: 'success' | 'warning' | 'error'; key: 'approved' | 'rejected' | 'pending' } | null {
  if (billing !== 'return') return null;
  const raw = (collectionStatus ?? status ?? '').toLowerCase();
  if (raw === 'approved' || raw === 'authorized') return { tone: 'success', key: 'approved' };
  if (raw === 'rejected' || raw === 'cancelled' || raw === 'failure') {
    return { tone: 'error', key: 'rejected' };
  }
  return { tone: 'warning', key: 'pending' };
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams?: Promise<{
    mp_checkout?: string;
    plan?: string;
    interval?: string;
    preapproval_id?: string;
    billing?: string;
    status?: string;
    collection_status?: string;
  }>;
}) {
  const user = await requireStoreUser('/settings/subscription', 'settings.billing');
  const now = new Date();
  const [store, payments, monthlyUsage] = await Promise.all([
    loadStoreContext(user.storeId),
    listSubscriptionPayments(user.storeId),
    loadMonthlyFeatureUsage(user.storeId, now),
  ]);
  const usage = store.usage;
  const t = await getTranslations('Settings');
  const tPlans = await getTranslations('Plans');
  const limits = PlanLimits.of(store.tier);

  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;

  const params = (await searchParams) ?? {};
  const billingReturn = resolveBillingReturnNotice(
    params.billing,
    params.status,
    params.collection_status,
  );
  const initialLocalCheckout =
    isLocalMpTransport() &&
    params.mp_checkout === 'local' &&
    PAID_PLAN_TIERS.includes(params.plan as PaidPlanTier) &&
    BILLING_INTERVALS.includes(params.interval as BillingInterval)
      ? {
          planTier: params.plan as PaidPlanTier,
          billingInterval: params.interval as BillingInterval,
          preapprovalId: params.preapproval_id ?? null,
        }
      : null;

  const currentPeriodEndLabel = store.subscription.currentPeriodEnd
    ? formatDate(store.subscription.currentPeriodEnd)
    : null;

  const heroStatus: SubscriptionStatus =
    store.tier === 'CASERO' && store.subscription.status !== 'CANCELED'
      ? 'ACTIVE'
      : store.subscription.status;

  const canCancelAutoRenew =
    store.tier !== 'CASERO' &&
    store.subscription.status !== 'TRIALING' &&
    store.subscription.status !== 'CANCELED' &&
    !store.subscription.cancelAtPeriodEnd;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('subscriptionTitle')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>

      {billingReturn ? (
        <Notice tone={billingReturn.tone}>
          <p>{t(`billingReturn.${billingReturn.key}`)}</p>
        </Notice>
      ) : null}

      {store.isReadOnly ? (
        <Notice tone="error">
          <div className="flex flex-col gap-2">
            <p className="font-semibold">{t('readOnlyLockTitle')}</p>
            <p>{t('readOnlyLockBody', { plan: tPlans(`names.${store.tier}`) })}</p>
            <ul className="flex flex-col gap-1 font-normal">
              {store.overLimitResources.map((resource) => (
                <li
                  key={resource}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums"
                >
                  <span>
                    {t('overLimitItem', {
                      resource: t(`usage.${resource}`),
                      used: usage[resource],
                      max: limits[resource] ?? 0,
                    })}
                  </span>
                  <Link
                    href={RESOURCE_HREF[resource]}
                    className="font-semibold underline underline-offset-4"
                  >
                    {t(`manageResource.${resource}`)}
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href="#plans"
              className="inline-flex w-fit font-semibold underline underline-offset-4"
            >
              {t('jumpToPlans')}
            </a>
          </div>
        </Notice>
      ) : null}

      {store.subscription.status === 'PAST_DUE' &&
      store.subscription.gracePeriodEndsAt &&
      store.graceDaysRemaining !== null ? (
        <Notice tone="warning">
          <div className="flex flex-col gap-2">
            <p className="font-semibold">{t('graceWarningTitle')}</p>
            <p>
              {t('graceWarningBody', {
                date: formatDate(store.subscription.gracePeriodEndsAt),
                days: store.graceDaysRemaining,
              })}
            </p>
            <a
              href="#plans"
              className="inline-flex w-fit font-semibold underline underline-offset-4"
            >
              {t('jumpToPlans')}
            </a>
          </div>
        </Notice>
      ) : null}

      <section className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold text-ink">
                {t('currentPlan', { plan: tPlans(`names.${store.tier}`) })}
              </h2>
              <SubscriptionStatusBadge status={heroStatus} />
            </div>

            {trialEndsAt && store.trialDaysRemaining !== null ? (
              <p className="text-sm text-ink-soft">
                {t('trialUntil', {
                  date: formatDate(trialEndsAt),
                  days: store.trialDaysRemaining,
                })}
              </p>
            ) : store.subscription.cancelAtPeriodEnd && currentPeriodEndLabel ? (
              <p className="text-sm text-ink-soft">
                {t('canceledUntil', {
                  plan: tPlans(`names.${store.tier}`),
                  date: currentPeriodEndLabel,
                })}
              </p>
            ) : currentPeriodEndLabel && store.tier !== 'CASERO' ? (
              <p className="text-sm text-ink-soft">
                {t('activeUntil', { date: currentPeriodEndLabel })}
              </p>
            ) : (
              <p className="text-sm text-ink-soft">{t('caseroHint')}</p>
            )}
          </div>

          {canCancelAutoRenew ? (
            <div className="shrink-0">
              <CancelRenewalDialog usage={usage} currentPeriodEndLabel={currentPeriodEndLabel} />
            </div>
          ) : null}
        </div>

        {/* US26 crit. 4: uso actual frente al límite estructural */}
        <ul className="flex flex-col gap-4">
          {RESOURCES.map((resource) => {
            const max = limits[resource];
            const used = usage[resource];
            const percent =
              max === null ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
            const isOver = max !== null && used > max;
            const isNear = max !== null && !isOver && percent >= 85;
            return (
              <li key={resource} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{t(`usage.${resource}`)}</span>
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      isOver ? 'text-error-ink' : isNear ? 'text-amber-ink' : 'text-ink',
                    )}
                  >
                    {max === null ? t('usageUnlimited', { used }) : t('usageOf', { used, max })}
                  </span>
                </div>
                {max === null ? null : (
                  <div
                    role="meter"
                    aria-label={t(`usage.${resource}`)}
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuenow={used}
                    aria-valuetext={t('usageOf', { used, max })}
                    className="h-2 overflow-hidden rounded-full bg-paper-deep"
                  >
                    <div
                      data-status={isOver ? 'error' : isNear ? 'warning' : 'ok'}
                      className={cn(
                        'h-full rounded-full',
                        isOver ? 'bg-error' : isNear ? 'bg-amber' : 'bg-primary',
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Cuotas mensuales del mes calendario en Lima */}
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-[13px] font-medium text-ink-soft">{t('monthlyQuotasTitle')}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {MONTHLY_QUOTAS.map((quota) => {
              const max = limits[quota];
              const used = monthlyUsage[quota];
              const percent =
                max === null || max === 0 ? 0 : Math.min(100, Math.round((used / max) * 100));
              const isOver = max !== null && max > 0 && used > max;
              const isNear = max !== null && max > 0 && !isOver && percent >= 85;
              return (
                <div key={quota} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-ink-soft">{t(`usage.${quota}`)}</dt>
                  <dd
                    className={cn(
                      'font-semibold tabular-nums',
                      max === 0
                        ? 'text-[13px] font-normal text-ink-soft'
                        : isOver
                          ? 'text-error-ink'
                          : isNear
                            ? 'text-amber-ink'
                            : 'text-ink',
                    )}
                  >
                    {max === 0
                      ? t('monthlyQuotaLocked')
                      : max === null
                        ? t('usageUnlimited', { used })
                        : t('usageOf', { used, max })}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      <section id="plans" className="flex scroll-mt-24 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">{t('plansTitle')}</h2>
          <p className="text-sm text-ink-soft">{t('plansSubtitle')}</p>
        </div>
        <SubscriptionPlans
          currentTier={store.tier}
          subscriptionStatus={store.subscription.status}
          billingInterval={store.subscription.billingInterval ?? null}
          cancelAtPeriodEnd={Boolean(store.subscription.cancelAtPeriodEnd)}
          isReadOnly={store.isReadOnly}
          usage={usage}
          initialLocalCheckout={initialLocalCheckout}
        />
      </section>

      <section
        id="billing-history"
        aria-labelledby="billing-history-title"
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id="billing-history-title" className="text-lg font-semibold text-ink">
            {t('billingHistory.title')}
          </h2>
          <p className="text-sm text-ink-soft">{t('billingHistory.subtitle')}</p>
        </div>

        {payments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-4 py-8 text-center">
            <ReceiptTextIcon aria-hidden="true" className="size-8 text-ink-soft" />
            <p className="text-sm text-ink-soft">{t('billingHistory.empty')}</p>
            <a href="#plans" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('billingHistory.emptyAction')}
            </a>
          </div>
        ) : (
          <>
            {/* Celular: lista de tarjetas sin scroll horizontal (DESIGN.md §5) */}
            <ul className="flex flex-col gap-2 lg:hidden">
              {payments.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-base font-medium text-ink">
                        {tPlans(`names.${row.planTier}`)} ·{' '}
                        {tPlans(`intervals.${row.billingInterval}`)}
                      </span>
                      <span className="text-[13px] text-ink-soft tabular-nums">
                        {formatDate(row.paidAt ?? row.createdAt)} ·{' '}
                        {row.billingInterval === 'YEARLY'
                          ? t('billingHistory.methods.yape')
                          : t('billingHistory.methods.card')}
                      </span>
                    </div>
                    <Money
                      amount={row.amount}
                      currency={row.currency}
                      className="shrink-0 text-base font-semibold text-ink"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                    <SubscriptionStatusBadge status={row.status} />
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/settings/billing/${row.id}`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-link-active hover:underline"
                      >
                        {t('billingHistory.seeReceipt')}
                      </Link>
                      {row.receiptUrl ? (
                        <a
                          href={row.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center text-[13px] text-ink-soft underline underline-offset-4 hover:text-ink"
                        >
                          {t('billingHistory.externalReceipt')}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Escritorio: tabla con encabezado fijo */}
            <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-paper-deep text-[13px] text-ink-soft">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('billingHistory.colDate')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('billingHistory.colPlan')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('billingHistory.colMethod')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('billingHistory.colAmount')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('billingHistory.colStatus')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('billingHistory.colReceipt')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.id} className="border-t border-line hover:bg-surface-hover">
                      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
                        {formatDate(row.paidAt ?? row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {tPlans(`names.${row.planTier}`)} ·{' '}
                        {tPlans(`intervals.${row.billingInterval}`)}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {row.billingInterval === 'YEARLY'
                          ? t('billingHistory.methods.yape')
                          : t('billingHistory.methods.card')}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        <Money amount={row.amount} currency={row.currency} />
                      </td>
                      <td className="px-4 py-3">
                        <SubscriptionStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          <Link
                            href={`/settings/billing/${row.id}`}
                            className="font-medium text-link-active hover:underline"
                          >
                            {t('billingHistory.seeReceipt')}
                          </Link>
                          {row.receiptUrl ? (
                            <a
                              href={row.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[13px] text-ink-soft underline underline-offset-4 hover:text-ink"
                            >
                              {t('billingHistory.externalReceipt')}
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
