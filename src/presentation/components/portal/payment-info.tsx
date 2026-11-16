import { getTranslations } from 'next-intl/server';
import type { Currency } from '@/core/domain/shared/money';
import type { StorePayment } from '@/infrastructure/db/queries/store-payment';
import { Money } from '@/presentation/components/money';
import { CopyPaymentValueButton, QrZoomTrigger } from './payment-info-actions';

/** US14.6: los datos de cobro que configuró la tienda (Yape, Plin, cuenta, CCI o QR). */
export async function PaymentInfo({
  payment,
  qrUrl,
  storeName,
  suggestedAmount,
  currency,
}: {
  payment: StorePayment;
  qrUrl: string | null;
  storeName: string;
  suggestedAmount?: string | null;
  currency?: Currency;
}) {
  const t = await getTranslations('Portal.payment');
  const rows = [
    { key: 'yape', value: payment.yapeNumber, copyable: true },
    { key: 'plin', value: payment.plinNumber, copyable: true },
    { key: 'bank', value: payment.bankName, copyable: false },
    { key: 'account', value: payment.bankAccountNumber, copyable: true },
    { key: 'cci', value: payment.bankCci, copyable: true },
  ].filter((row): row is { key: string; value: string; copyable: boolean } => Boolean(row.value));

  return (
    <section
      id="payment-info"
      aria-labelledby="payment-title"
      className="flex scroll-mt-20 flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="payment-title" className="text-xl font-semibold text-ink">
          {t('title')}
        </h2>
        {suggestedAmount && currency ? (
          <span className="text-base text-ink-soft">
            {t('suggested', { amount: '' })}
            <Money
              amount={suggestedAmount}
              currency={currency}
              className="font-semibold text-ink"
            />
          </span>
        ) : null}
      </div>

      {rows.length === 0 && !qrUrl ? (
        <p className="rounded-field bg-paper-deep p-4 text-base text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          {rows.length > 0 ? (
            <ul className="flex min-w-0 flex-1 flex-col divide-y divide-line rounded-field border border-line bg-paper/40">
              {rows.map(({ key, value, copyable }) => {
                const label = t(key);
                return (
                  <li key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm text-ink-soft">{label}</span>
                      <span className="text-lg font-semibold break-all text-ink tabular-nums select-all sm:text-xl">
                        {value}
                      </span>
                    </div>
                    {copyable ? <CopyPaymentValueButton label={label} value={value} /> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {qrUrl ? <QrZoomTrigger qrUrl={qrUrl} storeName={storeName} /> : null}
        </div>
      )}
    </section>
  );
}
