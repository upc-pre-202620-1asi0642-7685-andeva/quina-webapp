import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getReceipt } from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { formatMoney, Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { formatDate } from '@/presentation/lib/format-date';

const AMOUNT = /^\d{1,10}\.\d{2}$/;

/** Recibo del cobro (US13 crit. 6): se ve, se imprime y llega por correo. */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; change?: string }>;
}) {
  const { id } = await params;
  const user = await requireStoreUser(`/payments/${id}`, 'payments.create');
  if (!z.uuid().safeParse(id).success) notFound();
  const receipt = await getReceipt(user.storeId, id);
  if (!receipt) notFound();

  const t = await getTranslations('Collections.receipt');
  const tPay = await getTranslations('Collections.pay');
  const { notice, change } = await searchParams;
  const currency = receipt.currency;
  const paidNow = notice === 'paid';
  const changeGiven = change && AMOUNT.test(change) ? change : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Link
        href={`/customers/${receipt.customer.id}`}
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline print:hidden"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('back', { name: receipt.customer.firstName })}
      </Link>

      {paidNow ? (
        <Notice tone="success">
          <p>
            {changeGiven
              ? t('paidWithChange', { change: formatMoney(changeGiven, currency) })
              : t('paid')}
          </p>
          <Link
            href={`/customers/${receipt.customer.id}/pay`}
            className="font-semibold underline underline-offset-4 print:hidden"
          >
            {t('nextCycle')}
          </Link>
        </Notice>
      ) : null}

      <article className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6 print:border-0 print:p-0">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-ink-soft">
            {receipt.store.name} · {receipt.store.taxIdType} {receipt.store.taxIdNumber}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t('title', { number: receipt.receiptNumber })}
          </h1>
          <p className="text-sm text-ink-soft">{formatDate(receipt.paymentDate)}</p>
        </header>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-soft">{t('customer')}</dt>
            <dd className="font-medium text-ink">
              {receipt.customer.firstName} {receipt.customer.lastName}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-soft">{t('cycle')}</dt>
            <dd className="font-medium text-ink">
              <Link
                href={`/customers/${receipt.customer.id}/cycles/${receipt.cycle.id}`}
                className="hover:underline"
              >
                {formatDate(receipt.cycle.cutOffDate)}
              </Link>
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-soft">{t('method')}</dt>
            <dd className="font-medium text-ink">{tPay(`methods.${receipt.paymentMethod}`)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-soft">{t('collector')}</dt>
            <dd className="font-medium text-ink">{receipt.collector}</dd>
          </div>
        </dl>

        <dl className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <div className="flex items-center justify-between gap-3 text-ink-soft">
            <dt>{t('principal')}</dt>
            <dd className="text-ink">
              <Money amount={receipt.principalPaid} currency={currency} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-ink-soft">
            <dt>{t('compensatory')}</dt>
            <dd className="text-ink">
              <Money amount={receipt.compensatoryInterestPaid} currency={currency} />
            </dd>
          </div>
          {receipt.daysLate > 0 ? (
            <div className="flex items-center justify-between gap-3 text-ink-soft">
              <dt>{t('moratory', { days: receipt.daysLate })}</dt>
              <dd className="text-ink">
                <Money amount={receipt.moratoryInterestPaid} currency={currency} />
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold text-ink">
            <dt>{t('total')}</dt>
            <dd>
              <Money amount={receipt.amountPaid} currency={currency} />
            </dd>
          </div>
        </dl>
      </article>

      <div className="flex justify-end">
        <PrintButton />
      </div>
    </div>
  );
}
