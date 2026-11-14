import { getTranslations } from 'next-intl/server';
import { can } from '@/core/domain/identity/permissions';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { getTaxSettings } from '@/infrastructure/db/queries/tax';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PaymentDetailsForm } from '@/presentation/components/settings/payment-details-form';
import { TaxSettingsForm } from '@/presentation/components/settings/tax-settings-form';

// La URL firmada del QR dura lo que una visita a la página
const QR_URL_SECONDS = 15 * 60;

/** Datos de la tienda: cobro y tributos. El plan vive en /settings/subscription. */
export default async function SettingsPage() {
  const user = await requireStoreUser('/settings', 'settings.billing');
  const t = await getTranslations('Settings');
  // En paralelo: antes iban uno tras otro
  const [payment, taxSettings] = await Promise.all([
    can(user.role, 'store.payment_details') ? getStorePayment(user.storeId) : null,
    can(user.role, 'rus.view') ? getTaxSettings(user.storeId) : null,
  ]);
  const qrUrl = payment?.qrPath
    ? await getPrivateFileStorage().signedUrl(payment.qrPath, QR_URL_SECONDS)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('storeSubtitle')}</p>
      </header>

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
    </div>
  );
}
