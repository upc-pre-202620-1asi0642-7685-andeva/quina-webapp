import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getSubscriptionPaymentReceipt } from '@/infrastructure/db/queries/subscriptions';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { formatMoney } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';

export default async function SubscriptionReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireStoreUser(`/settings/billing/${id}`, 'settings.billing');
  if (!z.uuid().safeParse(id).success) notFound();
  const receipt = await getSubscriptionPaymentReceipt(user.storeId, id);
  if (!receipt) notFound();

  const t = await getTranslations('Settings.billingReceipt');
  const tHistory = await getTranslations('Settings.billingHistory');
  const tPlans = await getTranslations('Plans');

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Link
        href="/settings#billing-history"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline print:hidden"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('back')}
      </Link>

      <article className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6">
        <header className="flex flex-col gap-1 border-b border-line pb-4">
          <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Quina</p>
          <h1 className="text-xl font-semibold text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">
            {t('subtitle', {
              store: receipt.store.commercialName,
              taxId: receipt.store.taxIdNumber,
            })}
          </p>
        </header>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-soft">{t('reference')}</dt>
            <dd className="font-mono text-xs break-all text-ink">{receipt.mpPaymentId}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">{t('status')}</dt>
            <dd className="font-medium text-ink">{tHistory(`statuses.${receipt.status}`)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">{t('plan')}</dt>
            <dd className="font-medium text-ink">{tPlans(`names.${receipt.planTier}`)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">{t('interval')}</dt>
            <dd className="font-medium text-ink">
              {tPlans(`intervals.${receipt.billingInterval}`)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">{t('method')}</dt>
            <dd className="font-medium text-ink">
              {receipt.billingInterval === 'YEARLY'
                ? tHistory('methods.yape')
                : tHistory('methods.card')}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">{t('paidAt')}</dt>
            <dd className="font-medium text-ink">
              {formatDate(receipt.paidAt ?? receipt.createdAt)}
            </dd>
          </div>
        </dl>

        <div className="flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-sm font-semibold text-ink">{t('total')}</span>
          <span className="text-2xl font-semibold text-ink tabular-nums">
            {formatMoney(receipt.amount, receipt.currency)}
          </span>
        </div>
      </article>

      <div className="flex justify-end gap-3">
        {receipt.receiptUrl ? (
          <a
            href={receipt.receiptUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-hover print:hidden"
          >
            {tHistory('externalReceipt')}
          </a>
        ) : null}
        <PrintButton label={t('print')} />
      </div>
    </div>
  );
}
