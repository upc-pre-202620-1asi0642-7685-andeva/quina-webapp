import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getReceipt } from '@/infrastructure/db/queries/collections';
import { requirePortalUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { ReceiptCard } from '@/presentation/components/collections/receipt-card';
import { formatMoney } from '@/presentation/components/money';
import { ShareReceiptButton } from '@/presentation/components/portal/share-receipt-button';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';

/** US14.6: el vecino ve e imprime el recibo de cada pago que hizo. */
export default async function PortalReceiptPage({
  params,
}: {
  params: Promise<{ storeId: string; paymentId: string }>;
}) {
  const { storeId, paymentId } = await params;
  const { links } = await requirePortalUser(`/portal/${storeId}/payments/${paymentId}`);
  if (!z.uuid().safeParse(storeId).success || !z.uuid().safeParse(paymentId).success) notFound();
  const link = links.find((l) => l.storeId === storeId);
  if (!link) notFound();
  const receipt = await getReceipt(storeId, paymentId, link.customerId);
  if (!receipt) notFound();
  const t = await getTranslations('Portal.receipt');
  const tCollections = await getTranslations('Collections.receipt');

  const summary = t('shareText', {
    number: receipt.receiptNumber,
    store: receipt.store.name,
    amount: formatMoney(receipt.amountPaid, receipt.currency),
    date: formatDate(receipt.paymentDate),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/portal/${storeId}/cycles/${receipt.cycle.id}`}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          <span>{t('backToCycle')}</span>
        </Link>
        <Link
          href={`/portal/${storeId}`}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          {t('backToAccount')}
        </Link>
      </div>
      <ReceiptCard
        receipt={receipt}
        cycleHref={`/portal/${storeId}/cycles/${receipt.cycle.id}`}
        large
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end print:hidden">
        <PrintButton size="lg" />
        <ShareReceiptButton
          title={tCollections('title', { number: receipt.receiptNumber })}
          summary={summary}
        />
      </div>
    </>
  );
}
