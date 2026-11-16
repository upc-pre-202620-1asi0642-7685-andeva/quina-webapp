import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getReceipt } from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { ReceiptActions } from '@/presentation/components/collections/receipt-actions';
import { ReceiptCard } from '@/presentation/components/collections/receipt-card';
import { formatMoney } from '@/presentation/components/money';
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
  const tPage = await getTranslations('Collections.page');
  const { notice, change } = await searchParams;
  const currency = receipt.currency;
  const paidNow = notice === 'paid';
  const changeGiven = change && AMOUNT.test(change) ? change : null;

  const summaryText = t('shareSummary', {
    store: receipt.store.name,
    number: receipt.receiptNumber,
    date: formatDate(receipt.paymentDate),
    customer: `${receipt.customer.firstName} ${receipt.customer.lastName}`,
    amount: formatMoney(receipt.amountPaid, currency),
    method: tPay(`methods.${receipt.paymentMethod}`),
  });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/customers/${receipt.customer.id}`}
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          {t('back', { name: receipt.customer.firstName })}
        </Link>
        <Link
          href="/collections?tab=payments"
          className="inline-flex min-h-11 items-center text-sm font-medium text-ink-soft hover:text-ink hover:underline"
        >
          {tPage('title')}
        </Link>
      </div>

      {paidNow ? (
        <div className="print:hidden">
          <Notice tone="success">
            <p>
              {changeGiven
                ? t('paidWithChange', { change: formatMoney(changeGiven, currency) })
                : t('paid')}
            </p>
            <Link
              href={`/customers/${receipt.customer.id}/pay`}
              className="font-semibold underline underline-offset-4"
            >
              {t('nextCycle')}
            </Link>
          </Notice>
        </div>
      ) : null}

      <ReceiptCard
        receipt={receipt}
        cycleHref={`/customers/${receipt.customer.id}/cycles/${receipt.cycle.id}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <ReceiptActions
          summaryText={summaryText}
          customerPhone={receipt.customer.phone}
          whatsappMessage={summaryText}
        />
        <PrintButton />
      </div>
    </div>
  );
}
