import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, SearchIcon, UserPlusIcon, UsersIcon } from 'lucide-react';
import { can } from '@/core/domain/identity/permissions';
import { Money as MoneyValue, type Currency } from '@/core/domain/shared/money';
import { listCustomers, type CustomerListItem } from '@/infrastructure/db/queries/customers';
import { requireStoreUser } from '@/presentation/auth/guards';
import { customerStatus, StatusBadge } from '@/presentation/components/customers/status-badge';
import { Money } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

function available(item: CustomerListItem): { amount: string; currency: Currency } | null {
  if (!item.account || item.account.status !== 'ACTIVE' || !item.isActive) return null;
  const currency = item.account.currency as Currency;
  const left = MoneyValue.of(item.account.creditLimit, currency).minus(
    MoneyValue.of(item.account.currentBalance, currency),
  );
  return { amount: left.toFixed2(), currency };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireStoreUser('/customers', 'customers.read');
  const t = await getTranslations('Customers.list');
  const { q = '' } = await searchParams;
  const query = q.slice(0, 60);
  const customers = await listCustomers(user.storeId, query);
  const canCreate = can(user.role, 'customers.create');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        {canCreate ? (
          <Link href="/customers/new" className={buttonVariants()}>
            <UserPlusIcon aria-hidden="true" />
            {t('newButton')}
          </Link>
        ) : null}
      </header>

      <form role="search" action="/customers" className="flex gap-2">
        <label htmlFor="customer-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <Input
          id="customer-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="flex-1"
        />
        <button type="submit" className={buttonVariants({ variant: 'secondary', size: 'icon' })}>
          <SearchIcon aria-hidden="true" />
          <span className="sr-only">{t('searchSubmit')}</span>
        </button>
      </form>

      {customers.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <UsersIcon aria-hidden="true" className="size-8 text-ink-soft" />
          {query ? (
            <>
              <p className="text-base text-ink">{t('noResults', { query })}</p>
              <Link href="/customers" className={buttonVariants({ variant: 'secondary' })}>
                {t('clearSearch')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">{t('emptyTitle')}</h2>
              <p className="max-w-sm text-sm text-ink-soft">{t('emptyBody')}</p>
              {canCreate ? (
                <Link href="/customers/new" className={buttonVariants({ className: 'mt-2' })}>
                  <UserPlusIcon aria-hidden="true" />
                  {t('newButton')}
                </Link>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <section aria-label={t('title')} className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft tabular-nums">
            {t('count', { count: customers.length })}
          </p>

          {/* Celular: lista de tarjetas (DESIGN.md §5) */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {customers.map((item) => {
              const left = available(item);
              return (
                <li key={item.id}>
                  <Link
                    href={`/customers/${item.id}`}
                    className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="truncate text-base font-medium text-ink">
                        {item.firstName} {item.lastName}
                      </span>
                      <span className="text-[13px] text-ink-soft tabular-nums">
                        {item.documentType} {item.documentNumber}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={customerStatus(item.isActive, item.account?.status)} />
                        {left ? (
                          <span className="text-sm text-ink">
                            <Money amount={left.amount} currency={left.currency} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-5 shrink-0 text-ink-soft"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Escritorio: tabla con encabezado fijo */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-deep text-left text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colName')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colDocument')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('colAvailable')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((item) => {
                  const left = available(item);
                  return (
                    <tr key={item.id} className="border-t border-line hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <Link
                          href={`/customers/${item.id}`}
                          className="font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-link-active"
                        >
                          {item.firstName} {item.lastName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-soft tabular-nums">
                        {item.documentType} {item.documentNumber}
                      </td>
                      <td className="px-4 py-3 text-right text-ink">
                        {left ? <Money amount={left.amount} currency={left.currency} /> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={customerStatus(item.isActive, item.account?.status)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
