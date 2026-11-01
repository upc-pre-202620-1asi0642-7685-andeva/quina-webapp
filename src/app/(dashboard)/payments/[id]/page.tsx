import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getReceipt } from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { ReceiptCard } from '@/presentation/components/collections/receipt-card';
import { formatMoney } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';

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

      <ReceiptCard
        receipt={receipt}
        cycleHref={`/customers/${receipt.customer.id}/cycles/${receipt.cycle.id}`}
      />

      <div className="flex justify-end">
        <PrintButton />
      </div>
    </div>
  );
}
