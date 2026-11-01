import { getTranslations } from 'next-intl/server';
import { CheckIcon, LockIcon } from 'lucide-react';
import {
  PLAN_PRICES,
  PLAN_TIERS,
  PlanLimits,
  type CountedResource,
  type Feature,
} from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { loadPlanUsage } from '@/infrastructure/db/queries/plan-usage';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PaymentDetailsForm } from '@/presentation/components/settings/payment-details-form';
import { formatMoney } from '@/presentation/components/money';
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

export default async function SettingsPage() {
  const user = await requireStoreUser('/settings', 'settings.billing');
  const [store, usage] = await Promise.all([
    loadStoreContext(user.storeId),
    loadPlanUsage(user.storeId),
  ]);
  const t = await getTranslations('Settings');
  const tPlans = await getTranslations('Plans');
  const limits = PlanLimits.of(store.tier);
  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;
  const unlimited = (max: number | null) => (max === null ? tPlans('unlimited') : String(max));
  const payment = can(user.role, 'store.payment_details')
    ? await getStorePayment(user.storeId)
    : null;
  const qrUrl = payment?.qrPath
    ? await getPrivateFileStorage().signedUrl(payment.qrPath, QR_URL_SECONDS)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">
            {t('currentPlan', { plan: tPlans(`names.${store.tier}`) })}
          </h2>
          {trialEndsAt ? (
            <p className="text-sm text-ink-soft">
              {t('trialUntil', { date: formatDate(trialEndsAt) })}
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
                        percent >= 100 ? 'bg-amber' : 'bg-primary',
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

      <section id="plans" className="flex scroll-mt-24 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">{t('plansTitle')}</h2>
          <p className="text-sm text-ink-soft">{t('plansSubtitle')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_TIERS.map((tier) => {
            const plan = PlanLimits.of(tier);
            const price = PLAN_PRICES[tier];
            const current = tier === store.tier;
            return (
              <article
                key={tier}
                className={cn(
                  'flex flex-col gap-3 rounded-card border bg-surface p-4',
                  current ? 'border-primary' : 'border-line',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">{tPlans(`names.${tier}`)}</h3>
                  {current ? (
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[13px] font-medium text-success-ink dark:bg-success/12">
                      {t('yourPlan')}
                    </span>
                  ) : null}
                </div>
                <p className="text-ink">
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatMoney(price.monthly, 'PEN')}
                  </span>
                  <span className="text-sm text-ink-soft"> {tPlans('perMonth')}</span>
                </p>
                {price.annual ? (
                  <p className="text-[13px] text-ink-soft">
                    {tPlans('annual', { price: formatMoney(price.annual, 'PEN') })}
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-soft">{tPlans('freeForever')}</p>
                )}
                <ul className="flex flex-col gap-1.5 text-sm text-ink">
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
              </article>
            );
          })}
        </div>
        {/* El pago en línea (Mercado Pago) llega con el Plan 7 */}
        <p className="text-sm text-ink-soft">{t('paymentSoon')}</p>
      </section>
    </div>
  );
}
