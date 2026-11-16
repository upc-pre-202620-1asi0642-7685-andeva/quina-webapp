import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleCheckIcon } from 'lucide-react';
import type { Receipt } from '@/infrastructure/db/queries/collections';
import { Money } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

/** Recibo de un cobro (US13 crit. 6); lo ven el dueño en su panel y el vecino en su portal (US14.6). */
export async function ReceiptCard({
  receipt,
  cycleHref,
  large = false,
}: {
  receipt: Receipt;
  cycleHref: string;
  /** Portal del vecino: un escalón más de letra (DESIGN.md §6.2). */
  large?: boolean;
}) {
  const t = await getTranslations('Collections.receipt');
  const tPortal = await getTranslations('Portal.receipt');
  const meta = large ? 'text-base' : 'text-sm';
  const body = large ? 'text-lg' : 'text-sm';
  const tPay = await getTranslations('Collections.pay');
  const currency = receipt.currency;

  return (
    <article className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 sm:p-6 print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('text-ink-soft', meta)}>
            {receipt.store.name} · {receipt.store.taxIdType} {receipt.store.taxIdNumber}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-0.5 text-[13px] font-medium text-success-ink">
            <CircleCheckIcon aria-hidden="true" className="size-4" />
            {tPortal('paidBadge')}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {t('title', { number: receipt.receiptNumber })}
        </h1>
        <p className={cn('text-ink-soft', meta)}>{formatDate(receipt.paymentDate)}</p>
      </header>

      <dl className={cn('grid grid-cols-2 gap-3', body)}>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('customer')}</dt>
          <dd className="font-medium text-ink">
            {receipt.customer.firstName} {receipt.customer.lastName}
          </dd>
          {receipt.customer.documentNumber ? (
            <dd className="text-[13px] text-ink-soft tabular-nums">
              {t('documentNumber', { doc: receipt.customer.documentNumber })}
            </dd>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-soft">{t('cycle')}</dt>
          <dd className="font-medium text-ink">
            <Link href={cycleHref} className="hover:underline">
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

      <dl className={cn('flex flex-col gap-2 border-t border-line pt-4', body)}>
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
        <div
          className={cn(
            'flex items-center justify-between gap-3 border-t border-line pt-3 font-semibold text-ink',
            large ? 'text-xl' : 'text-base',
          )}
        >
          <dt>{t('total')}</dt>
          <dd>
            <Money amount={receipt.amountPaid} currency={currency} />
          </dd>
        </div>
      </dl>

      {receipt.notes ? (
        <div className="rounded-field bg-paper-deep p-3.5">
          <p className={cn('font-medium text-ink-soft', meta)}>{tPortal('notes')}</p>
          <p className={cn('mt-0.5 text-ink', meta)}>{receipt.notes}</p>
        </div>
      ) : null}
    </article>
  );
}
