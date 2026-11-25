import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, CircleCheckIcon, StoreIcon } from 'lucide-react';
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
import { formatMoney, Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { InstallmentPlans } from '@/presentation/components/portal/installment-plans';
import { PaymentInfo } from '@/presentation/components/portal/payment-info';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

// La URL firmada del QR dura lo que una visita a la página
const QR_URL_SECONDS = 15 * 60;
const RECENT_CYCLES_LIMIT = 4;

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

  const payableBadge = account?.payable
    ? cycleBadgeStatus(
        account.payable.status as 'BILLED' | 'OVERDUE',
        account.payable.paymentDueDate,
        now,
      )
    : null;

  const recentCycles = cycles.slice(0, RECENT_CYCLES_LIMIT);
  const hasMoreCycles = cycles.length > RECENT_CYCLES_LIMIT;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-base text-ink-soft">{t('hello', { name: portal.customerName })}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink">
            {portal.storeName}
          </h1>
        </div>
        {links.length > 1 ? (
          <Link href="/portal" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <StoreIcon aria-hidden="true" className="size-4" />
            <span>{t('allStores')}</span>
          </Link>
        ) : null}
      </header>

      {portal.emailBouncedAt ? (
        <Notice tone="warning" className="text-base">
          <p>{t('emailBounced')}</p>
        </Notice>
      ) : null}

      {account && account.status !== 'ACTIVE' ? (
        <Notice tone="warning" className="text-base">
          <p>{t('blocked')}</p>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          {account ? (
            <section
              aria-labelledby="summary-title"
              className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
            >
              <h2 id="summary-title" className="sr-only">
                {t('summaryTitle')}
              </h2>
              <div className="flex flex-col gap-1">
                <span className="text-base text-ink-soft">{t('balance')}</span>
                <Money
                  amount={account.balance}
                  currency={account.currency}
                  className="text-amount font-bold tracking-tight text-ink"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={account.usedPercent}
                  aria-label={t('limitUsed', { percent: account.usedPercent })}
                  className="h-2.5 overflow-hidden rounded-full bg-paper-deep"
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-250 ease-(--ease-out-expo)',
                      account.overLimit || account.usedPercent >= 95
                        ? 'bg-error'
                        : account.usedPercent >= 85
                          ? 'bg-amber'
                          : 'bg-primary',
                    )}
                    style={{ width: `${account.usedPercent}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-base tabular-nums">
                  <span
                    className={cn(
                      account.overLimit ? 'font-medium text-error-ink' : 'text-ink-soft',
                    )}
                  >
                    {account.overLimit
                      ? t('overLimit')
                      : t('available', {
                          amount: formatMoney(account.availableCredit, account.currency),
                        })}
                  </span>
                  <span className="text-ink-soft">
                    {t('limitShort', {
                      amount: formatMoney(account.creditLimit, account.currency),
                    })}
                  </span>
                </div>
              </div>

              {account.payable && payableBadge ? (
                <div
                  className={cn(
                    'flex flex-col gap-3 rounded-field p-4 sm:p-5',
                    payableBadge === 'OVERDUE'
                      ? 'bg-error/12'
                      : payableBadge === 'DUE_SOON'
                        ? 'bg-amber/12'
                        : 'bg-soft',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{t('toPay')}</span>
                    <CycleStatusBadge status={payableBadge} />
                  </div>
                  <Money
                    amount={account.payable.totalDue}
                    currency={account.currency}
                    className="text-3xl font-bold tracking-tight text-ink"
                  />
                  <p
                    className={cn(
                      'text-base font-medium',
                      payableBadge === 'OVERDUE'
                        ? 'text-error-ink'
                        : payableBadge === 'DUE_SOON'
                          ? 'text-amber-ink'
                          : 'text-soft-ink-2',
                    )}
                  >
                    {t('payBy', { date: formatDate(account.payable.paymentDueDate) })}
                  </p>
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
                    <Link
                      href={`/portal/${storeId}/cycles/${account.payable.cycleId}`}
                      className={buttonVariants({
                        variant: 'primary',
                        size: 'lg',
                        className: 'w-full sm:w-auto',
                      })}
                    >
                      {t('seeStatement')}
                    </Link>
                    <Link
                      href={`/portal/${storeId}/pay`}
                      className={buttonVariants({
                        variant: 'secondary',
                        size: 'lg',
                        className: 'w-full sm:w-auto',
                      })}
                    >
                      {t('howToPay')}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-field bg-paper-deep p-4 sm:p-5">
                  <div className="flex items-center gap-2 font-semibold text-success-ink">
                    <CircleCheckIcon aria-hidden="true" className="size-5 shrink-0" />
                    <span>{t('allGood')}</span>
                  </div>
                  <p className="text-base text-ink-soft">{t('nothingDue')}</p>
                  {account.openCycle && account.openCycle.amount !== '0.00' ? (
                    <Link
                      href={`/portal/${storeId}/cycles/${account.openCycle.cycleId}`}
                      className={buttonVariants({
                        variant: 'secondary',
                        size: 'lg',
                        className: 'w-full sm:w-auto sm:self-start',
                      })}
                    >
                      {t('openCycleCta', {
                        amount: formatMoney(account.openCycle.amount, account.currency),
                      })}
                    </Link>
                  ) : null}
                </div>
              )}

              <dl className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-4 py-3">
                  <dt className="text-sm text-ink-soft">{t('nextCutOff')}</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatDate(account.nextCutOffDate)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-4 py-3">
                  <dt className="text-sm text-ink-soft">{t('paymentDayTitle')}</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {t('paymentDay', { day: account.paymentDueDay })}
                  </dd>
                </div>
              </dl>
            </section>
          ) : (
            <Notice tone="info" className="text-base">
              <p>{t('noCredit')}</p>
            </Notice>
          )}

          {account ? (
            <div className="flex flex-col gap-3">
              <AccountCycles
                hrefBase={`/portal/${storeId}`}
                cycles={recentCycles}
                currency={account.currency}
                now={now}
                large
              />
              {hasMoreCycles ? (
                <Link
                  href={`/portal/${storeId}/cycles`}
                  className={buttonVariants({
                    variant: 'secondary',
                    size: 'lg',
                    className: 'w-full justify-between',
                  })}
                >
                  <span>{t('seeAllCycles', { count: cycles.length })}</span>
                  <ChevronRightIcon aria-hidden="true" className="size-5" />
                </Link>
              ) : null}
            </div>
          ) : null}

          {account && plans.length > 0 ? (
            <InstallmentPlans plans={plans} currency={account.currency} />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-8 lg:col-span-5">
          <PaymentInfo
            payment={payment}
            qrUrl={qrUrl}
            storeName={portal.storeName}
            suggestedAmount={account?.payable?.totalDue ?? null}
            currency={account?.currency}
          />

          <Link
            href={`/portal/${storeId}/store`}
            className="flex min-h-16 items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-colors duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active sm:p-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
                <StoreIcon aria-hidden="true" className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-semibold text-ink">
                  {t('storeInfoTitle')}
                </span>
                <span className="truncate text-sm text-ink-soft">{t('storeInfoHint')}</span>
              </div>
            </div>
            <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
          </Link>
        </div>
      </div>
    </>
  );
}
