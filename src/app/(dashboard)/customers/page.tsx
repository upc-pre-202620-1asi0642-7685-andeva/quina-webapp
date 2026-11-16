import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  BanknoteIcon,
  ChevronRightIcon,
  ShoppingBagIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import { can } from '@/core/domain/identity/permissions';
import { type Currency } from '@/core/domain/shared/money';
import { listCustomers, type CustomerListItem } from '@/infrastructure/db/queries/customers';
import { requireStoreUser } from '@/presentation/auth/guards';
import { CustomerListControls } from '@/presentation/components/customers/customer-list-controls';
import { customerStatus, StatusBadge } from '@/presentation/components/customers/status-badge';
import { formatMoney, Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import {
  availableCreditAmount,
  customerInitials,
  customerListHref,
  filterAndSortCustomers,
  parseCustomerListQuery,
  summarizeCustomerList,
} from '@/presentation/lib/customer-list';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

function meterBarClass(item: CustomerListItem, usedPercent: number, overLimit: boolean): string {
  if (item.collections.hasOverdue || overLimit || usedPercent >= 95) return 'bg-error';
  if (item.collections.hasDueSoon || usedPercent >= 85) return 'bg-amber';
  return 'bg-primary';
}

function CollectionStatusPill({
  item,
  t,
}: {
  item: CustomerListItem;
  t: Awaited<ReturnType<typeof getTranslations<'Customers.list'>>>;
}) {
  if (!item.account || item.collections.payableCyclesCount === 0) return null;
  const currency = item.account.currency as Currency;
  if (item.collections.hasOverdue) {
    return (
      <span className="inline-flex items-center rounded-full bg-error/12 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-error-ink tabular-nums">
        {t('overdueBadge', { amount: formatMoney(item.collections.overdueAmount, currency) })}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
        item.collections.hasDueSoon ? 'bg-amber/12 text-amber-ink' : 'bg-soft text-soft-ink',
      )}
    >
      {t('dueBadge', { amount: formatMoney(item.collections.payableAmount, currency) })}
    </span>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; sort?: string }>;
}) {
  const user = await requireStoreUser('/customers', 'customers.read');
  const t = await getTranslations('Customers.list');
  const raw = await searchParams;
  const query = parseCustomerListQuery(raw);
  const now = new Date();

  const [allCustomers, store] = await Promise.all([
    listCustomers(user.storeId, query.q, now),
    loadStoreContext(user.storeId),
  ]);

  const summary = summarizeCustomerList(allCustomers);
  const customers = filterAndSortCustomers(allCustomers, query);

  const canCreate = can(user.role, 'customers.create');
  const canSell = can(user.role, 'sales.create');
  const canCollect = can(user.role, 'payments.create');
  const isReadOnly = store.isReadOnly;

  const hasInitialCustomers = allCustomers.length > 0 || Boolean(query.q);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        {canCreate && !isReadOnly ? (
          <Link href="/customers/new" className={buttonVariants()}>
            <UserPlusIcon aria-hidden="true" />
            {t('newButton')}
          </Link>
        ) : null}
      </header>

      {isReadOnly && canCreate ? (
        <Notice tone="warning">
          <p>{t('readOnlyNotice')}</p>
        </Notice>
      ) : null}

      {hasInitialCustomers ? (
        <>
          {allCustomers.length > 0 ? (
            <dl className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-3">
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className="text-[13px] text-ink-soft">{t('summaryActive')}</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">
                  {summary.totalActive}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className="text-[13px] text-ink-soft">{t('summaryCredit')}</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">
                  {summary.withCredit}
                </dd>
              </div>
              <div className="col-span-2 flex flex-col gap-0.5 border-t border-line px-4 py-3 sm:col-span-1 sm:border-t-0">
                <dt className="text-[13px] text-ink-soft">{t('summaryCollectable')}</dt>
                <dd className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-ink tabular-nums">
                    {summary.collectableCount}
                  </span>
                  {summary.overdueCount > 0 ? (
                    <Link
                      href={customerListHref({ q: query.q, filter: 'overdue', sort: query.sort })}
                      className="inline-flex min-h-9 items-center rounded-full bg-error/12 px-2.5 py-1 text-xs font-medium text-error-ink tabular-nums hover:opacity-90"
                    >
                      {summary.overdueCount} {t('summaryOverdue').toLowerCase()}
                    </Link>
                  ) : null}
                </dd>
              </div>
            </dl>
          ) : null}

          <CustomerListControls
            query={query.q}
            filter={query.filter}
            sort={query.sort}
            counts={summary.counts}
          />
        </>
      ) : null}

      {customers.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <UsersIcon aria-hidden="true" className="size-8 text-ink-soft" />
          {query.q ? (
            <>
              <p className="text-base text-ink">{t('noResults', { query: query.q })}</p>
              <Link href="/customers" className={buttonVariants({ variant: 'secondary' })}>
                {t('clearSearch')}
              </Link>
            </>
          ) : query.filter !== 'all' ? (
            <>
              <p className="text-base text-ink">{t('noFilterResults')}</p>
              <Link href="/customers" className={buttonVariants({ variant: 'secondary' })}>
                {t('clearFilters')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">{t('emptyTitle')}</h2>
              <p className="max-w-sm text-sm text-ink-soft">{t('emptyBody')}</p>
              {canCreate && !isReadOnly ? (
                <Link href="/customers/new" className={buttonVariants({ className: 'mt-2' })}>
                  <UserPlusIcon aria-hidden="true" />
                  {t('newButton')}
                </Link>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <section aria-label={t('title')} className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft tabular-nums">
            {t('count', { count: customers.length })}
          </p>

          {/* Celular: tarjetas compactas con medidor y acciones a un toque (DESIGN.md §5) */}
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {customers.map((item) => {
              const credit = availableCreditAmount(item.account);
              const showSell =
                canSell && !isReadOnly && item.isActive && item.account?.status === 'ACTIVE';
              const showCollect =
                canCollect && !isReadOnly && item.collections.payableCyclesCount > 0;
              const status = customerStatus(item.isActive, item.account?.status);

              return (
                <li
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
                >
                  <Link
                    href={`/customers/${item.id}`}
                    className="flex items-start gap-3 p-4 transition-[background-color,transform] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        status === 'ACTIVE'
                          ? 'bg-soft text-soft-ink'
                          : 'bg-paper-deep text-ink-soft',
                      )}
                    >
                      {customerInitials(item.firstName, item.lastName)}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-medium text-ink">
                            {item.firstName} {item.lastName}
                          </p>
                          <p className="text-[13px] text-ink-soft tabular-nums">
                            {item.documentType} {item.documentNumber}
                          </p>
                        </div>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="mt-1 size-5 shrink-0 text-ink-soft"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={status} />
                        <CollectionStatusPill item={item} t={t} />
                      </div>

                      {credit && item.account ? (
                        <div className="flex flex-col gap-1.5 pt-0.5">
                          <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                meterBarClass(item, credit.usedPercent, credit.overLimit),
                              )}
                              style={{ width: `${credit.usedPercent}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] tabular-nums">
                            <span className="text-ink-soft">
                              <Money
                                amount={item.account.currentBalance}
                                currency={credit.currency}
                              />
                              {' / '}
                              <Money amount={item.account.creditLimit} currency={credit.currency} />
                            </span>
                            {item.isActive && item.account.status === 'ACTIVE' ? (
                              <span className="font-medium text-ink">
                                {t('colAvailable')}:{' '}
                                <Money amount={credit.amount} currency={credit.currency} />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Link>

                  {showSell || showCollect ? (
                    <div className="flex items-center gap-2 border-t border-line bg-paper-deep/50 px-4 py-2">
                      {showCollect ? (
                        <Link
                          href={`/customers/${item.id}/pay`}
                          className={buttonVariants({
                            variant: item.collections.hasOverdue ? 'primary' : 'secondary',
                            size: 'sm',
                            className: 'flex-1',
                          })}
                        >
                          <BanknoteIcon aria-hidden="true" />
                          {t('actionCollect')}
                        </Link>
                      ) : null}
                      {showSell ? (
                        <Link
                          href={`/sales?customerId=${item.id}`}
                          className={buttonVariants({
                            variant: 'secondary',
                            size: 'sm',
                            className: 'flex-1',
                          })}
                        >
                          <ShoppingBagIcon aria-hidden="true" />
                          {t('actionSell')}
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Escritorio: tabla con encabezado fijo, medidor y accesos rápidos */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-deep text-left text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colName')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colStatus')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colBalance')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('colAvailable')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('colActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((item) => {
                  const credit = availableCreditAmount(item.account);
                  const status = customerStatus(item.isActive, item.account?.status);
                  const showSell =
                    canSell && !isReadOnly && item.isActive && item.account?.status === 'ACTIVE';
                  const showCollect =
                    canCollect && !isReadOnly && item.collections.payableCyclesCount > 0;

                  return (
                    <tr key={item.id} className="border-t border-line hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <Link
                          href={`/customers/${item.id}`}
                          className="group flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-link-active"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                              status === 'ACTIVE'
                                ? 'bg-soft text-soft-ink'
                                : 'bg-paper-deep text-ink-soft',
                            )}
                          >
                            {customerInitials(item.firstName, item.lastName)}
                          </span>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium text-ink underline-offset-4 group-hover:underline">
                              {item.firstName} {item.lastName}
                            </span>
                            <span className="text-[13px] text-ink-soft tabular-nums">
                              {item.documentType} {item.documentNumber}
                            </span>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={status} />
                          <CollectionStatusPill item={item} t={t} />
                          {item.collections.nextDueDate ? (
                            <span className="text-xs text-ink-soft tabular-nums">
                              {t('dueDateShort', {
                                date: formatDate(item.collections.nextDueDate),
                              })}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {credit && item.account ? (
                          <div className="flex min-w-36 flex-col gap-1">
                            <div className="flex items-baseline justify-between gap-2 text-[13px] tabular-nums">
                              <span className="font-medium text-ink">
                                <Money
                                  amount={item.account.currentBalance}
                                  currency={credit.currency}
                                />
                              </span>
                              <span className="text-ink-soft">
                                <Money
                                  amount={item.account.creditLimit}
                                  currency={credit.currency}
                                />
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  meterBarClass(item, credit.usedPercent, credit.overLimit),
                                )}
                                style={{ width: `${credit.usedPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-soft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                        {credit && item.isActive && item.account?.status === 'ACTIVE' ? (
                          <Money amount={credit.amount} currency={credit.currency} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {showCollect ? (
                            <Link
                              href={`/customers/${item.id}/pay`}
                              className={buttonVariants({
                                variant: item.collections.hasOverdue ? 'primary' : 'secondary',
                                size: 'sm',
                              })}
                            >
                              <BanknoteIcon aria-hidden="true" />
                              {t('actionCollect')}
                            </Link>
                          ) : null}
                          {showSell ? (
                            <Link
                              href={`/sales?customerId=${item.id}`}
                              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                            >
                              <ShoppingBagIcon aria-hidden="true" />
                              {t('actionSell')}
                            </Link>
                          ) : null}
                          <Link
                            href={`/customers/${item.id}`}
                            aria-label={`${item.firstName} ${item.lastName}`}
                            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                          >
                            <ChevronRightIcon aria-hidden="true" />
                          </Link>
                        </div>
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
