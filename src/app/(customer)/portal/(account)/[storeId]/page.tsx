import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, PhoneIcon } from 'lucide-react';
import { z } from 'zod';
import { listCycles } from '@/infrastructure/db/queries/collections';
import { getInstallmentPlans, getPortalAccount } from '@/infrastructure/db/queries/portal';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { requirePortalUser } from '@/presentation/auth/guards';
import { AccountCycles } from '@/presentation/components/collections/account-cycles';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { Money } from '@/presentation/components/money';
import { InstallmentPlans } from '@/presentation/components/portal/installment-plans';
import { PaymentInfo } from '@/presentation/components/portal/payment-info';
import { formatDate } from '@/presentation/lib/format-date';

// La URL firmada del QR dura lo que una visita a la página
const QR_URL_SECONDS = 15 * 60;

/** US14.6 y 14.7: lo que Doña Rosa debe en una tienda, cuándo y cómo pagarlo. */
export default async function PortalAccountPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { links } = await requirePortalUser(`/portal/${storeId}`);
  if (!z.uuid().safeParse(storeId).success) notFound();
  // El storeId de la URL vale solo si el correo del vecino está en esa tienda (D1)
  const link = links.find((l) => l.storeId === storeId);
  if (!link) notFound();

  const now = new Date();
  const portal = await getPortalAccount(link, now);
  if (!portal) notFound();
  const t = await getTranslations('Portal.account');
  const account = portal.account;
  const [cycles, plans, payment] = await Promise.all([
    account ? listCycles(storeId, account.id) : Promise.resolve([]),
    account ? getInstallmentPlans(storeId, account.id) : Promise.resolve([]),
    getStorePayment(storeId),
  ]);
  const qrUrl = payment.qrPath
    ? await getPrivateFileStorage().signedUrl(payment.qrPath, QR_URL_SECONDS)
    : null;

  return (
    <>
      {links.length > 1 ? (
        <Link
          href="/portal"
          className="inline-flex min-h-11 items-center gap-2 self-start text-base font-medium text-link-active hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-5" />
          {t('allStores')}
        </Link>
      ) : null}

      <header className="flex flex-col gap-1">
        <p className="text-ink-soft">{t('hello', { name: portal.customerName })}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink">
          {portal.storeName}
        </h1>
      </header>

      {account ? (
        <section
          aria-labelledby="summary-title"
          className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="summary-title" className="sr-only">
            {t('summaryTitle')}
          </h2>
          <div className="flex flex-col gap-1">
            <span className="text-ink-soft">{t('balance')}</span>
            <Money
              amount={account.balance}
              currency={account.currency}
              className="text-4xl font-semibold tracking-tight text-ink"
            />
          </div>

          {account.payable ? (
            <div className="flex flex-col gap-2 rounded-field bg-paper-deep p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">{t('toPay')}</span>
                <CycleStatusBadge
                  status={cycleBadgeStatus(
                    account.payable.status as 'BILLED' | 'OVERDUE',
                    account.payable.paymentDueDate,
                    now,
                  )}
                />
              </div>
              <Money
                amount={account.payable.totalDue}
                currency={account.currency}
                className="text-3xl font-semibold text-ink"
              />
              <p className="text-ink-soft">
                {t('payBy', { date: formatDate(account.payable.paymentDueDate) })}
              </p>
              <Link
                href={`/portal/${storeId}/cycles/${account.payable.cycleId}`}
                className="inline-flex min-h-11 items-center self-start font-semibold text-link-active underline-offset-4 hover:underline"
              >
                {t('seeStatement')}
              </Link>
            </div>
          ) : (
            <p className="rounded-field bg-paper-deep p-4 text-ink-soft">{t('nothingDue')}</p>
          )}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-base text-ink-soft">{t('nextCutOff')}</dt>
              <dd className="font-semibold text-ink">{formatDate(account.nextCutOffDate)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-base text-ink-soft">{t('creditLimit')}</dt>
              <dd className="font-semibold text-ink">
                <Money amount={account.creditLimit} currency={account.currency} />
              </dd>
            </div>
          </dl>
          {account.status !== 'ACTIVE' ? (
            <p className="text-base text-ink-soft">{t('blocked')}</p>
          ) : null}
        </section>
      ) : (
        <p className="rounded-card border border-line bg-surface p-5 text-ink-soft">
          {t('noCredit')}
        </p>
      )}

      <PaymentInfo payment={payment} qrUrl={qrUrl} />

      {account && plans.length > 0 ? (
        <InstallmentPlans plans={plans} currency={account.currency} />
      ) : null}

      {account ? (
        <AccountCycles
          hrefBase={`/portal/${storeId}`}
          cycles={cycles}
          currency={account.currency}
          now={now}
          large
        />
      ) : null}

      {portal.storeContact ? (
        <a
          href={`tel:${portal.storeContact}`}
          className="inline-flex min-h-11 items-center gap-2 self-start font-medium text-link-active hover:underline"
        >
          <PhoneIcon aria-hidden="true" className="size-5" />
          {t('callStore', { phone: portal.storeContact })}
        </a>
      ) : null}
    </>
  );
}
