import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PhoneIcon } from 'lucide-react';
import { z } from 'zod';
import { getPortalAccount } from '@/infrastructure/db/queries/portal';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requirePortalUser } from '@/presentation/auth/guards';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { PaymentInfo } from '@/presentation/components/portal/payment-info';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';

const QR_URL_SECONDS = 15 * 60;

/** Vista dedicada de pago del vecino (Yape, Plin, banco, CCI y QR). */
export default async function PortalPayPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { links } = await requirePortalUser(`/portal/${storeId}/pay`);
  if (!z.uuid().safeParse(storeId).success) notFound();
  const link = links.find((l) => l.storeId === storeId);
  if (!link) notFound();

  const now = new Date();
  const [portal, payment] = await Promise.all([
    getPortalAccount(link, now),
    getStorePayment(storeId),
  ]);
  if (!portal) notFound();

  const qrUrl = payment.qrPath
    ? await getPrivateFileStorage().signedUrl(payment.qrPath, QR_URL_SECONDS)
    : null;
  const t = await getTranslations('Portal.payPage');
  const tAccount = await getTranslations('Portal.account');
  const account = portal.account;

  const payableBadge = account?.payable
    ? cycleBadgeStatus(
        account.payable.status as 'BILLED' | 'OVERDUE',
        account.payable.paymentDueDate,
        now,
      )
    : null;

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-base text-ink-soft">{portal.storeName}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-base text-ink-soft">{t('subtitle')}</p>
      </header>

      {account?.payable && payableBadge ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-medium text-ink-soft">{tAccount('toPay')}</span>
              <CycleStatusBadge status={payableBadge} />
            </div>
            <Money
              amount={account.payable.totalDue}
              currency={account.currency}
              className="text-3xl font-bold tracking-tight text-ink"
            />
            <span className="text-base text-ink-soft">
              {tAccount('payBy', { date: formatDate(account.payable.paymentDueDate) })}
            </span>
          </div>
          <Link
            href={`/portal/${storeId}/cycles/${account.payable.cycleId}`}
            className={buttonVariants({ variant: 'secondary', size: 'lg' })}
          >
            {tAccount('seeStatement')}
          </Link>
        </section>
      ) : null}

      <PaymentInfo
        payment={payment}
        qrUrl={qrUrl}
        storeName={portal.storeName}
        suggestedAmount={account?.payable?.totalDue ?? null}
        currency={account?.currency}
        hideTitle
      />

      <Notice tone="info" className="text-base">
        <p>{t('confirmHint')}</p>
      </Notice>

      {portal.storeContact ? (
        <div className="flex">
          <a
            href={`tel:${portal.storeContact}`}
            className={buttonVariants({
              variant: 'secondary',
              size: 'lg',
              className: 'w-full sm:w-auto',
            })}
          >
            <PhoneIcon aria-hidden="true" className="size-5" />
            <span>{tAccount('callStore', { phone: portal.storeContact })}</span>
          </a>
        </div>
      ) : null}
    </>
  );
}
