import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getReceipt } from '@/infrastructure/db/queries/collections';
import { requirePortalUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { ReceiptCard } from '@/presentation/components/collections/receipt-card';

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
  const t = await getTranslations('Portal.cycle');

  return (
    <>
      <Link
        href={`/portal/${storeId}`}
        className="inline-flex min-h-11 items-center gap-2 self-start text-base font-medium text-link-active hover:underline print:hidden"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-5" />
        {t('back')}
      </Link>
      <ReceiptCard
        receipt={receipt}
        cycleHref={`/portal/${storeId}/cycles/${receipt.cycle.id}`}
        large
      />
      <div className="flex justify-end">
        <PrintButton />
      </div>
    </>
  );
}
