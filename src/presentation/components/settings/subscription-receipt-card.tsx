import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { SubscriptionReceiptDetail } from '@/core/domain/ports/subscription-repository';
import { Money } from '@/presentation/components/money';
import { SubscriptionStatusBadge } from '@/presentation/components/settings/subscription-status-badge';
import { formatDate } from '@/presentation/lib/format-date';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';

/** Comprobante imprimible de un pago de suscripción (US23 crit. 5). */
export async function SubscriptionReceiptCard({ receipt }: { receipt: SubscriptionReceiptDetail }) {
  const t = await getTranslations('Settings.billingReceipt');
  const tHistory = await getTranslations('Settings.billingHistory');
  const tPlans = await getTranslations('Plans');
  const tShell = await getTranslations('Shell');
  const processedAt = receipt.paidAt ?? receipt.createdAt;

  return (
    <article className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6 print:border-0 print:p-0">
      <header className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex items-center justify-between gap-3">
          <Image src={isologo} alt={tShell('logoAlt')} className="h-7 w-auto" />
          <SubscriptionStatusBadge status={receipt.status} />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft tabular-nums">{formatDate(processedAt)}</p>
        </div>
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('storeLabel')}</dt>
          <dd className="font-medium text-ink">
            {receipt.store.commercialName} · {receipt.store.taxIdType}{' '}
            <span className="tabular-nums">{receipt.store.taxIdNumber}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('ownerLabel')}</dt>
          <dd className="font-medium text-ink">{receipt.store.ownerFullName}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('emailLabel')}</dt>
          <dd className="font-medium break-all text-ink">{receipt.store.contactEmail}</dd>
        </div>
        {receipt.store.address ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-soft">{t('addressLabel')}</dt>
            <dd className="font-medium text-ink">{receipt.store.address}</dd>
          </div>
        ) : null}
      </dl>

      <dl className="grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('reference')}</dt>
          <dd className="font-mono text-[13px] break-all text-ink tabular-nums">
            {receipt.mpPaymentId}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('plan')}</dt>
          <dd className="font-medium text-ink">{tPlans(`names.${receipt.planTier}`)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('interval')}</dt>
          <dd className="font-medium text-ink">{tPlans(`intervals.${receipt.billingInterval}`)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('method')}</dt>
          <dd className="font-medium text-ink">
            {receipt.billingInterval === 'YEARLY'
              ? tHistory('methods.yape')
              : tHistory('methods.card')}
          </dd>
        </div>
      </dl>

      <dl className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
        <div className="flex items-center justify-between gap-3 text-base font-semibold text-ink">
          <dt>{t('total')}</dt>
          <dd className="text-2xl font-bold tabular-nums">
            <Money amount={receipt.amount} currency={receipt.currency} />
          </dd>
        </div>
      </dl>
    </article>
  );
}
