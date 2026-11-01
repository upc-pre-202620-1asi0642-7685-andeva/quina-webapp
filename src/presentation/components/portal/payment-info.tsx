import { getTranslations } from 'next-intl/server';
import type { StorePayment } from '@/infrastructure/db/queries/store-payment';

/** US14.6: los datos de cobro que configuró la tienda (Yape, Plin, cuenta, CCI o QR). */
export async function PaymentInfo({
  payment,
  qrUrl,
}: {
  payment: StorePayment;
  qrUrl: string | null;
}) {
  const t = await getTranslations('Portal.payment');
  const rows = [
    ['yape', payment.yapeNumber],
    ['plin', payment.plinNumber],
    ['bank', payment.bankName],
    ['account', payment.bankAccountNumber],
    ['cci', payment.bankCci],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <section
      aria-labelledby="payment-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="payment-title" className="text-xl font-semibold text-ink">
        {t('title')}
      </h2>
      {rows.length === 0 && !qrUrl ? (
        <p className="text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <dl className="flex flex-col gap-3">
            {rows.map(([key, value]) => (
              <div key={key} className="flex flex-col">
                <dt className="text-base text-ink-soft">{t(key)}</dt>
                <dd className="text-xl font-semibold break-all text-ink tabular-nums select-all">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, sin optimizador
            <img
              src={qrUrl}
              alt={t('qrAlt')}
              className="size-48 self-center rounded-field border border-line bg-white object-contain p-2 sm:self-start"
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
