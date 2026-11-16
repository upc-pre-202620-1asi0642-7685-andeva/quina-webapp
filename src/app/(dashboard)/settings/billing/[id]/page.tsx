import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react';
import { z } from 'zod';
import { getSubscriptionPaymentReceipt } from '@/infrastructure/db/queries/subscriptions';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PrintButton } from '@/presentation/components/collections/print-button';
import { SubscriptionReceiptCard } from '@/presentation/components/settings/subscription-receipt-card';
import { buttonVariants } from '@/presentation/components/ui/button';

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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Link
        href="/settings/subscription#billing-history"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-link-active hover:underline print:hidden"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('back')}
      </Link>

      <SubscriptionReceiptCard receipt={receipt} />

      <div className="flex flex-wrap justify-end gap-3 print:hidden">
        {receipt.receiptUrl ? (
          <a
            href={receipt.receiptUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'secondary' })}
          >
            <ExternalLinkIcon aria-hidden="true" />
            {tHistory('externalReceipt')}
          </a>
        ) : null}
        <PrintButton label={t('print')} />
      </div>
    </div>
  );
}
