import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, StoreIcon } from 'lucide-react';
import { getPortalAccount } from '@/infrastructure/db/queries/portal';
import { requirePortalUser } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';

/** US14: las tiendas donde el vecino tiene fiado; con una sola, va directo a ella. */
export default async function PortalHomePage() {
  const { user, links } = await requirePortalUser('/portal');
  const t = await getTranslations('Portal.home');

  if (links.length === 1) redirect(`/portal/${links[0]!.storeId}`);
  if (links.length === 0) {
    return (
      <Notice tone="warning">
        <p>{t('noStores', { email: user.email })}</p>
      </Notice>
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
        {accounts.map((account) => (
          <li key={account.storeId}>
            <Link
              href={`/portal/${account.storeId}`}
              className="flex min-h-20 items-center gap-4 rounded-card border border-line bg-surface p-4 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <StoreIcon aria-hidden="true" className="size-7 shrink-0 text-ink-soft" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold text-ink">{account.storeName}</span>
                <span className="text-base text-ink-soft">
                  {account.account ? t('balance') : t('noCredit')}
                </span>
              </span>
              {account.account ? (
                <Money
                  amount={account.account.balance}
                  currency={account.account.currency}
                  className="text-xl font-semibold whitespace-nowrap text-ink"
                />
              ) : null}
              <ChevronRightIcon aria-hidden="true" className="size-6 shrink-0 text-ink-soft" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
