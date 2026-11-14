import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CheckIcon, LockIcon } from 'lucide-react';
import {
  BILLING_INTERVALS,
  PAID_PLAN_TIERS,
  PlanLimits,
  type BillingInterval,
  type CountedResource,
  type Feature,
  type PaidPlanTier,
} from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { listSubscriptionPayments } from '@/infrastructure/db/queries/subscriptions';
import { getTaxSettings } from '@/infrastructure/db/queries/tax';
import { isLocalMpTransport } from '@/infrastructure/payments/mercado-pago-subscription-gateway';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requireStoreUser } from '@/presentation/auth/guards';
import { formatMoney } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { PaymentDetailsForm } from '@/presentation/components/settings/payment-details-form';
import { SubscriptionPlans } from '@/presentation/components/settings/subscription-plans';
import { TaxSettingsForm } from '@/presentation/components/settings/tax-settings-form';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

const RESOURCES: CountedResource[] = ['activeCreditCustomers', 'users', 'products'];
const FEATURES: Feature[] = [
  'automaticNotifications',
  'receipts',
  'kardexAverageCost',
  'reportsExport',
  'ai',
];

// La URL firmada del QR dura lo que una visita a la página
const QR_URL_SECONDS = 15 * 60;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    mp_checkout?: string;
    plan?: string;
    interval?: string;
    preapproval_id?: string;
  }>;
}) {
  const user = await requireStoreUser('/settings', 'settings.billing');
  const [store, payments] = await Promise.all([
    loadStoreContext(user.storeId),
    listSubscriptionPayments(user.storeId),
  ]);
  const usage = store.usage;
  const t = await getTranslations('Settings');
  const tPlans = await getTranslations('Plans');
  const limits = PlanLimits.of(store.tier);
  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;
  const payment = can(user.role, 'store.payment_details')
    ? await getStorePayment(user.storeId)
    : null;
  const taxSettings = can(user.role, 'rus.view') ? await getTaxSettings(user.storeId) : null;
  const qrUrl = payment?.qrPath
    ? await getPrivateFileStorage().signedUrl(payment.qrPath, QR_URL_SECONDS)
    : null;

  const params = (await searchParams) ?? {};
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>

      {store.isReadOnly ? (
        <Notice tone="error">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t('readOnlyLockTitle')}</p>
            <p>{t('readOnlyLockBody', { plan: tPlans(`names.${store.tier}`) })}</p>
          </div>
        </Notice>
      ) : null}

      {store.subscription.status === 'PAST_DUE' &&
      store.subscription.gracePeriodEndsAt &&
      store.graceDaysRemaining !== null ? (
        <Notice tone="warning">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t('graceWarningTitle')}</p>
            <p>
              {t('graceWarningBody', {
                date: formatDate(store.subscription.gracePeriodEndsAt),
                days: store.graceDaysRemaining,
              })}
            </p>
          </div>
        </Notice>
      ) : null}

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">
            {t('currentPlan', { plan: tPlans(`names.${store.tier}`) })}
          </h2>
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
          ) : null}
        </div>

        {/* US26 crit. 4: uso actual frente al límite */}
        <ul className="flex flex-col gap-4">
          {RESOURCES.map((resource) => {
            const max = limits[resource];
            const used = usage[resource];
            const percent = max === null ? 0 : Math.min(100, Math.round((used / max) * 100));
            return (
              <li key={resource} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{t(`usage.${resource}`)}</span>
                  <span className="font-semibold text-ink tabular-nums">
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
                    className="h-2 overflow-hidden rounded-full bg-paper-deep"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full',
                        used > max ? 'bg-error' : percent >= 100 ? 'bg-amber' : 'bg-primary',
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* US26 crit. 5: lo bloqueado se ve, con el plan que lo habilita */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const enabled = limits.features[feature];
            return (
              <li key={feature} className="flex items-start gap-2 text-sm">
                {enabled ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-success-ink"
                  />
                ) : (
                  <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                )}
                <span className={enabled ? 'text-ink' : 'text-ink-soft'}>
                  {tPlans(`features.${feature}`)}
                  {enabled ? null : (
                    <>
                      {' · '}
                      {tPlans('availableIn', {
                        plan: tPlans(`names.${PlanLimits.featureTier(feature)}`),
                      })}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Plan 5, P3: lo que el vecino ve en su portal para pagar */}
      {payment ? (
        <section
          id="payment"
          aria-labelledby="payment-title"
          className="flex scroll-mt-24 flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="payment-title" className="text-lg font-semibold text-ink">
              {t('payment.title')}
            </h2>
            <p className="text-sm text-ink-soft">{t('payment.subtitle')}</p>
          </div>
          <PaymentDetailsForm initial={payment} qrUrl={qrUrl} />
        </section>
      ) : null}

      {/* US21 crit. 1: régimen tributario y categoría del Nuevo RUS */}
      {taxSettings ? (
        <section
          id="tax"
          aria-labelledby="tax-title"
          className="flex scroll-mt-24 flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="tax-title" className="text-lg font-semibold text-ink">
              {t('tax.title')}
            </h2>
            <p className="text-sm text-ink-soft">{t('tax.subtitle')}</p>
          </div>
          <TaxSettingsForm initial={taxSettings} />
        </section>
      ) : null}

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
          currentPeriodEndLabel={currentPeriodEndLabel}
          initialLocalCheckout={initialLocalCheckout}
        />
      </section>

      <section
        id="billing-history"
        aria-labelledby="billing-history-title"
        className="flex scroll-mt-24 flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="billing-history-title" className="text-lg font-semibold text-ink">
            {t('billingHistory.title')}
          </h2>
          <p className="text-sm text-ink-soft">{t('billingHistory.subtitle')}</p>
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('billingHistory.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">{t('billingHistory.colDate')}</th>
                  <th className="py-2 pr-3 font-medium">{t('billingHistory.colPlan')}</th>
                  <th className="py-2 pr-3 font-medium">{t('billingHistory.colMethod')}</th>
                  <th className="py-2 pr-3 font-medium">{t('billingHistory.colAmount')}</th>
                  <th className="py-2 pr-3 font-medium">{t('billingHistory.colStatus')}</th>
                  <th className="py-2 text-right font-medium">{t('billingHistory.colReceipt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.map((row) => (
                  <tr key={row.id}>
                    <td className="py-3 pr-3 whitespace-nowrap text-ink">
                      {formatDate(row.paidAt ?? row.createdAt)}
                    </td>
                    <td className="py-3 pr-3 text-ink">
                      {tPlans(`names.${row.planTier}`)} ·{' '}
                      {tPlans(`intervals.${row.billingInterval}`)}
                    </td>
                    <td className="py-3 pr-3 text-ink-soft">
                      {row.billingInterval === 'YEARLY'
                        ? t('billingHistory.methods.yape')
                        : t('billingHistory.methods.card')}
                    </td>
                    <td className="py-3 pr-3 font-semibold text-ink tabular-nums">
                      {formatMoney(row.amount, row.currency)}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          row.status === 'APPROVED'
                            ? 'bg-primary-soft text-success-ink dark:bg-success/12'
                            : row.status === 'REJECTED'
                              ? 'bg-error/12 text-error-ink'
                              : 'bg-amber/12 text-amber-ink',
                        )}
                      >
                        {t(`billingHistory.statuses.${row.status}`)}
                      </span>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
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
                            className="text-xs text-ink-soft underline hover:text-ink"
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
        )}
      </section>
    </div>
  );
}
