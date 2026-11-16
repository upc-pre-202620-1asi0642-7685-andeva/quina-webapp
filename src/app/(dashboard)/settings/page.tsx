import { getTranslations } from 'next-intl/server';
import { StoreIcon } from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { getStoreTaxContext, getTaxSettings, loadRusStatus } from '@/infrastructure/db/queries/tax';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PaymentDetailsForm } from '@/presentation/components/settings/payment-details-form';
import { StoreHubLinks } from '@/presentation/components/settings/store-hub-links';
import { TaxSettingsForm } from '@/presentation/components/settings/tax-settings-form';
import { loadStoreContext } from '@/presentation/queries/store-context';

// La URL firmada del QR dura lo que una visita a la página
const QR_URL_SECONDS = 15 * 60;

/** Datos de la tienda: accesos administrativos, cobro y tributos. */
export default async function SettingsPage() {
  const user = await requireStoreUser('/settings', 'settings.billing');
  const t = await getTranslations('Settings');
  const now = new Date();

  const canPayment = can(user.role, 'store.payment_details');
  const canRus = can(user.role, 'rus.view');
  const canManageTeam = can(user.role, 'team.manage');
  const canViewAudit = can(user.role, 'audit.view');

  const [store, payment, taxSettings, taxContext, rusStatus] = await Promise.all([
    loadStoreContext(user.storeId),
    canPayment ? getStorePayment(user.storeId) : null,
    canRus ? getTaxSettings(user.storeId) : null,
    canRus ? getStoreTaxContext(user.storeId, now) : null,
    canRus ? loadRusStatus(user.storeId, now) : null,
  ]);
  const qrUrl = payment?.qrPath
    ? await getPrivateFileStorage().signedUrl(payment.qrPath, QR_URL_SECONDS)
    : null;
  const usersMax = PlanLimits.of(store.tier).users;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('storeSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <StoreIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
            {store.name}
          </span>
          {taxContext ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {t('storeIdentity.taxId', {
                  type: taxContext.taxIdType,
                  number: taxContext.taxIdNumber,
                })}
              </span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>
            {t('storeIdentity.defaultLocale', {
              locale: t(`storeIdentity.locales.${store.defaultLocale}`),
            })}
          </span>
        </div>
      </header>

      <StoreHubLinks
        tier={store.tier}
        subscriptionStatus={store.subscription.status}
        cancelAtPeriodEnd={Boolean(store.subscription.cancelAtPeriodEnd)}
        isReadOnly={store.isReadOnly}
        trialDaysRemaining={store.trialDaysRemaining}
        canManageTeam={canManageTeam}
        usersUsed={store.usage.users}
        usersMax={usersMax}
        canViewAudit={canViewAudit}
      />

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
      {taxSettings && taxContext ? (
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
          <TaxSettingsForm initial={taxSettings} taxContext={taxContext} rusStatus={rusStatus} />
        </section>
      ) : null}
    </div>
  );
}
