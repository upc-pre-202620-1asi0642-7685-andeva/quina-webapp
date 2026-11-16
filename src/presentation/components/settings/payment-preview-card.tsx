'use client';

import { EyeIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type PaymentPreviewCardProps = {
  yapeNumber: string;
  plinNumber: string;
  bankName: string;
  bankAccountNumber: string;
  bankCci: string;
  qrUrl: string | null;
};

/** Vista previa en vivo del bloque de cobro que el vecino ve en su portal (Portal.payment). */
export function PaymentPreviewCard({
  yapeNumber,
  plinNumber,
  bankName,
  bankAccountNumber,
  bankCci,
  qrUrl,
}: PaymentPreviewCardProps) {
  const t = useTranslations('Settings.payment.preview');
  const rows = [
    ['yape', yapeNumber.trim()],
    ['plin', plinNumber.trim()],
    ['bank', bankName.trim()],
    ['account', bankAccountNumber.trim()],
    ['cci', bankCci.trim()],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <aside
      aria-labelledby="payment-preview-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-paper p-4 sm:p-5 lg:sticky lg:top-6"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <EyeIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
          <h3 id="payment-preview-title" className="text-sm font-semibold text-ink">
            {t('title')}
          </h3>
        </div>
        <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
          {t('portalBadge')}
        </span>
      </div>

      <p className="text-base font-semibold text-ink">{t('portalHeading')}</p>

      {rows.length === 0 && !qrUrl ? (
        <p className="text-sm leading-relaxed text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.length > 0 ? (
            <dl className="flex flex-col gap-3">
              {rows.map(([key, value]) => (
                <div key={key} className="flex flex-col">
                  <dt className="text-[13px] text-ink-soft">{t(`fields.${key}`)}</dt>
                  <dd className="text-base font-semibold break-all text-ink tabular-nums select-all">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {qrUrl ? (
            <div className="flex justify-center self-center rounded-field border border-line bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal o vista previa local */}
              <img src={qrUrl} alt={t('qrAlt')} className="size-40 object-contain" />
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
