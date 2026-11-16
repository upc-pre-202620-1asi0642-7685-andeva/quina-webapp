import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, CircleCheckIcon, StoreIcon } from 'lucide-react';
import { getPortalAccount } from '@/infrastructure/db/queries/portal';
import { requirePortalUser } from '@/presentation/auth/guards';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { Money } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

/** US14: las tiendas donde el vecino tiene fiado; con una sola, va directo a ella. */
export default async function PortalHomePage() {
  const { user, links } = await requirePortalUser('/portal');
  const t = await getTranslations('Portal.home');

  if (links.length === 1) redirect(`/portal/${links[0]!.storeId}`);
  if (links.length === 0) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-6 py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
          <StoreIcon aria-hidden="true" className="size-8" />
        </span>
        <div className="flex max-w-md flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('emptyTitle')}</h1>
          <p className="text-base text-ink-soft">{t('noStores', { email: user.email })}</p>
        </div>
        <Link
          href="/portal/profile"
          className={buttonVariants({ variant: 'secondary', size: 'lg' })}
        >
          {t('goToProfile')}
        </Link>
      </section>
    );
  }

  const now = new Date();
  const accounts = (await Promise.all(links.map((link) => getPortalAccount(link, now)))).filter(
    (account) => account !== null,
  );

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-ink-soft">{t('subtitle')}</p>
      </header>
      <ul className="flex flex-col gap-3">
        {accounts.map((account) => {
          const payable = account.account?.payable;
          const badgeStatus = payable
            ? cycleBadgeStatus(payable.status as 'BILLED' | 'OVERDUE', payable.paymentDueDate, now)
            : null;
          const isZero = account.account?.balance === '0.00';

          return (
            <li key={account.storeId}>
              <Link
                href={`/portal/${account.storeId}`}
                className="flex min-h-24 items-center gap-4 rounded-card border border-line bg-surface p-4 transition-[transform,background-color] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100 sm:p-5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-full',
                    badgeStatus === 'OVERDUE'
                      ? 'bg-error/12 text-error-ink'
                      : badgeStatus === 'DUE_SOON'
                        ? 'bg-amber/12 text-amber-ink'
                        : 'bg-soft text-soft-ink',
                  )}
                >
                  <StoreIcon className="size-6" />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-ink">{account.storeName}</span>
                    {badgeStatus ? (
                      <CycleStatusBadge status={badgeStatus} />
                    ) : account.account && isZero ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-0.5 text-[13px] font-medium text-success-ink">
                        <CircleCheckIcon aria-hidden="true" className="size-3.5" />
                        {t('upToDate')}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-base text-ink-soft">
                    {!account.account
                      ? t('noCredit')
                      : payable
                        ? t('payBy', { date: formatDate(payable.paymentDueDate) })
                        : t('balance')}
                  </span>
                </span>

                {account.account ? (
                  <Money
                    amount={payable ? payable.totalDue : account.account.balance}
                    currency={account.account.currency}
                    className="text-xl font-semibold whitespace-nowrap text-ink"
                  />
                ) : null}
                <ChevronRightIcon aria-hidden="true" className="size-6 shrink-0 text-ink-soft" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
