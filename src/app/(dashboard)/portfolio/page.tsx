import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowDownWideNarrowIcon,
  DownloadIcon,
  HandCoinsIcon,
  LockIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TrendingDownIcon,
  WalletIcon,
  XIcon,
} from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import {
  PORTFOLIO_FILTERS,
  PORTFOLIO_SORTS,
  filterAndSortPortfolioRows,
  loadPortfolio,
  parsePortfolioQuery,
  portfolioHref,
  portfolioQueryString,
  type PortfolioRow,
} from '@/infrastructure/db/queries/portfolio';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { PortfolioChart } from '@/presentation/components/portfolio/portfolio-chart';
import { PortfolioHealthPanel } from '@/presentation/components/portfolio/portfolio-health-panel';
import { ScoreBreakdownPopover } from '@/presentation/components/portfolio/score-badge';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

function utilizationBarClass(row: PortfolioRow): string {
  if (row.isDelinquent) return 'bg-error';
  if (row.utilizationPct >= 85) return 'bg-amber';
  return 'bg-success';
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    band?: string;
    aging?: string;
    sort?: string;
  }>;
}) {
  const user = await requireStoreUser('/portfolio', 'reports.view');
  const t = await getTranslations('Portfolio');
  const tPlans = await getTranslations('Plans');

  const rawParams = await searchParams;
  const query = parsePortfolioQuery(rawParams);

  const [store, portfolio] = await Promise.all([
    loadStoreContext(user.storeId),
    loadPortfolio(user.storeId, new Date()),
  ]);

  // D1: el gráfico y la exportación CSV son de la vista avanzada (Pro y Plus)
  const advanced = PlanLimits.of(store.tier).features.reportsExport;
  const canCollect = can(user.role, 'payments.create');
  const canAdjustTerms = can(user.role, 'credit.terms');
  const canReadCustomers = can(user.role, 'customers.read');

  const rows = filterAndSortPortfolioRows(portfolio.rows, query);
  const { metrics } = portfolio;
  const hasOverdueMoney = MoneyValue.of(metrics.overdue, 'PEN').isPositive();
  const hasDelinquents = metrics.delinquentCustomers > 0;

  const qs = portfolioQueryString(query);
  const exportHref = `/app/api/portfolio/export${qs ? `?${qs}` : ''}`;
  const hasActiveFilters = Boolean(query.q || query.filter !== 'all' || query.band || query.aging);

  const cards = [
    {
      key: 'lent',
      value: <Money amount={metrics.lent} currency="PEN" />,
      alert: false,
    },
    {
      key: 'overdue',
      value: <Money amount={metrics.overdue} currency="PEN" />,
      alert: hasOverdueMoney,
    },
    {
      key: 'projected',
      value: <Money amount={metrics.projected} currency="PEN" />,
      alert: false,
    },
    {
      key: 'delinquent',
      value: <span className="tabular-nums">{metrics.delinquentCustomers}</span>,
      alert: hasDelinquents,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasDelinquents && canCollect ? (
            <Link
              href="/collections?tab=overdue"
              className={buttonVariants({ variant: 'secondary' })}
            >
              <HandCoinsIcon aria-hidden="true" />
              {t('actions.collections')}
            </Link>
          ) : null}
          {advanced ? (
            <a
              href={exportHref}
              download="quina-cartera.csv"
              className={buttonVariants({ variant: 'secondary' })}
            >
              <DownloadIcon aria-hidden="true" />
              {t('actions.exportCsv')}
            </a>
          ) : null}
        </div>
      </header>

      {/* US19 crit. 1: las cuatro métricas clave */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className={cn(
              'flex flex-col gap-1 rounded-card border p-4',
              card.alert
                ? 'border-error/25 bg-error/12 text-error-ink'
                : 'border-line bg-surface text-ink',
            )}
          >
            <dt className={cn('text-[13px]', card.alert ? 'text-error-ink' : 'text-ink-soft')}>
              {t(`metrics.${card.key}`)}
            </dt>
            <dd className="text-xl font-semibold">{card.value}</dd>
          </div>
        ))}
      </dl>

      {/* Bento analítico: evolución mensual + salud y antigüedad */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section
          aria-labelledby="chart-title"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <h2 id="chart-title" className="text-lg font-semibold text-ink">
            {t('chart.title')}
          </h2>
          {advanced ? (
            <PortfolioChart months={portfolio.months} />
          ) : (
            <p className="flex items-start gap-2 text-sm text-ink-soft">
              <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {t('chart.locked', {
                  plan: tPlans(`names.${PlanLimits.featureTier('reportsExport')}`),
                })}{' '}
                <Link
                  href="/settings/subscription"
                  className="font-medium text-link-active hover:underline"
                >
                  {t('chart.seePlans')}
                </Link>
              </span>
            </p>
          )}
        </section>

        <PortfolioHealthPanel
          bands={portfolio.bands}
          aging={portfolio.aging}
          totalLent={metrics.lent}
          query={query}
        />
      </div>

      {/* Lista de vecinos con búsqueda, filtros y ordenamiento por URL */}
      <section aria-labelledby="customers-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="customers-title" className="text-lg font-semibold text-ink">
            {t('list.title')}
          </h2>
          <nav
            aria-label={t('list.sortLabel')}
            className="inline-flex flex-wrap items-center rounded-full bg-paper-deep p-1"
          >
            {PORTFOLIO_SORTS.map((option) => {
              const active = query.sort === option;
              return (
                <Link
                  key={option}
                  href={portfolioHref(query, { sort: option })}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-link-active',
                    active ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <ArrowDownWideNarrowIcon aria-hidden="true" className="size-4" />
                  {t(`list.sort.${option}`)}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <Form role="search" action="/portfolio" className="flex gap-2">
            {query.filter !== 'all' ? (
              <input type="hidden" name="filter" value={query.filter} />
            ) : null}
            {query.band ? <input type="hidden" name="band" value={query.band} /> : null}
            {query.aging ? <input type="hidden" name="aging" value={query.aging} /> : null}
            {query.sort !== 'debt' ? <input type="hidden" name="sort" value={query.sort} /> : null}
            <label htmlFor="portfolio-search" className="sr-only">
              {t('list.searchLabel')}
            </label>
            <Input
              id="portfolio-search"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder={t('list.searchPlaceholder')}
              autoComplete="off"
              className="min-h-11 flex-1 text-base"
            />
            <button
              type="submit"
              className={buttonVariants({ variant: 'secondary', size: 'icon' })}
            >
              <SearchIcon aria-hidden="true" />
              <span className="sr-only">{t('list.searchSubmit')}</span>
            </button>
          </Form>

          <div className="flex flex-wrap items-center gap-2">
            {PORTFOLIO_FILTERS.map((filterKey) => {
              const active = query.filter === filterKey;
              return (
                <Link
                  key={filterKey}
                  href={portfolioHref(query, { filter: filterKey })}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
                    active
                      ? 'bg-soft text-soft-ink'
                      : 'border border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                  )}
                >
                  {t(`list.filters.${filterKey}`)}
                </Link>
              );
            })}

            {query.band ? (
              <Link
                href={portfolioHref(query, { band: null })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-soft px-3.5 text-sm font-medium text-soft-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
              >
                <span>{t(`health.bands.${query.band}`)}</span>
                <XIcon aria-hidden="true" className="size-4" />
              </Link>
            ) : null}

            {query.aging ? (
              <Link
                href={portfolioHref(query, { aging: null })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-soft px-3.5 text-sm font-medium text-soft-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active"
              >
                <span>{t(`health.aging.${query.aging}`)}</span>
                <XIcon aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>

        {portfolio.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
            <WalletIcon aria-hidden="true" className="size-8 text-ink-soft" />
            <h3 className="text-lg font-semibold text-ink">{t('list.emptyTitle')}</h3>
            <p className="max-w-sm text-sm text-ink-soft">{t('list.empty')}</p>
            {canReadCustomers ? (
              <Link
                href="/customers"
                className={buttonVariants({ variant: 'secondary', className: 'mt-1' })}
              >
                {t('list.emptyAction')}
              </Link>
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
            <SearchIcon aria-hidden="true" className="size-8 text-ink-soft" />
            <h3 className="text-lg font-semibold text-ink">{t('list.filteredEmptyTitle')}</h3>
            <p className="max-w-sm text-sm text-ink-soft">{t('list.filteredEmpty')}</p>
            {hasActiveFilters ? (
              <Link
                href="/portfolio"
                className={buttonVariants({ variant: 'secondary', className: 'mt-1' })}
              >
                {t('list.clearFilters')}
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft tabular-nums">
              {t('list.count', { shown: rows.length, total: portfolio.rows.length })}
            </p>

            {/* Celular: tarjetas táctiles (DESIGN.md §5) */}
            <ul className="flex flex-col gap-3 lg:hidden">
              {rows.map((row) => {
                const barWidth = Math.min(100, Math.max(0, row.utilizationPct));
                const overduePositive = MoneyValue.of(row.overdueBalance, 'PEN').isPositive();
                const dueSoonPositive = MoneyValue.of(row.dueSoonBalance, 'PEN').isPositive();

                return (
                  <li
                    key={row.customerId}
                    className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Link
                          href={`/customers/${row.customerId}`}
                          className="truncate text-base font-semibold text-ink underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <span className="text-[13px] text-ink-soft tabular-nums">
                          {row.documentType} {row.documentNumber}
                        </span>
                      </div>
                      <ScoreBreakdownPopover
                        breakdown={row.scoreBreakdown}
                        suggestLowerLimit={row.suggestLowerLimit}
                      />
                    </div>

                    {row.isDelinquent || row.suggestLowerLimit ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {row.isDelinquent ? (
                          <span className="inline-flex items-center rounded-full bg-error/12 px-2.5 py-0.5 text-[13px] font-medium text-error-ink tabular-nums">
                            {t('list.delinquent')} ·{' '}
                            {t('list.daysOverdue', { days: row.maxDaysOverdue })}
                          </span>
                        ) : null}
                        {row.suggestLowerLimit ? (
                          <Link
                            href={`/customers/${row.customerId}/terms`}
                            className="inline-flex items-center gap-1 text-[13px] font-medium text-error-ink hover:underline"
                          >
                            <TrendingDownIcon aria-hidden="true" className="size-4 shrink-0" />
                            {t('list.suggestLower')}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}

                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-[13px] text-ink-soft">{t('list.debt')}</dt>
                        <dd className="font-semibold text-ink">
                          <Money amount={row.currentBalance} currency="PEN" />
                        </dd>
                        {overduePositive ? (
                          <dd className="text-[13px] text-error-ink">
                            {t('list.overdueLabel')}{' '}
                            <Money amount={row.overdueBalance} currency="PEN" />
                          </dd>
                        ) : dueSoonPositive ? (
                          <dd className="text-[13px] text-amber-ink">
                            {t('list.dueSoonLabel')}{' '}
                            <Money amount={row.dueSoonBalance} currency="PEN" />
                          </dd>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <dt className="text-[13px] text-ink-soft">{t('list.limit')}</dt>
                        <dd className="text-ink">
                          <Money amount={row.creditLimit} currency="PEN" />
                        </dd>
                        <dd className="text-[13px] text-ink-soft tabular-nums">
                          {t('list.utilizationValue', {
                            pct: Math.round(row.utilizationPct),
                          })}
                        </dd>
                      </div>
                    </dl>

                    <div
                      aria-hidden="true"
                      className="h-1.5 w-full overflow-hidden rounded-full bg-paper-deep"
                    >
                      <div
                        className={cn('h-full rounded-full', utilizationBarClass(row))}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    {row.nextDueDate && !row.isDelinquent ? (
                      <p className="text-[13px] text-ink-soft tabular-nums">
                        {t('list.nextDue', { date: formatDate(row.nextDueDate) })}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {canCollect && row.payableCyclesCount > 0 ? (
                        <Link
                          href={`/customers/${row.customerId}/pay`}
                          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        >
                          <HandCoinsIcon aria-hidden="true" />
                          {t('actions.collect')}
                        </Link>
                      ) : null}
                      {canAdjustTerms ? (
                        <Link
                          href={`/customers/${row.customerId}/terms`}
                          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        >
                          <SlidersHorizontalIcon aria-hidden="true" />
                          {t('actions.adjustLimit')}
                        </Link>
                      ) : null}
                      {canReadCustomers ? (
                        <Link
                          href={`/customers/${row.customerId}`}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          {t('actions.viewProfile')}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Escritorio: tabla con encabezado fijo */}
            <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
              <table aria-label={t('list.title')} className="w-full text-sm">
                <thead className="sticky top-0 bg-paper-deep text-left text-[13px] text-ink-soft">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('list.colCustomer')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('list.colScore')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('list.debt')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('list.colLimitAndUse')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('list.colDue')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('list.colActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const barWidth = Math.min(100, Math.max(0, row.utilizationPct));
                    const overduePositive = MoneyValue.of(row.overdueBalance, 'PEN').isPositive();
                    const dueSoonPositive = MoneyValue.of(row.dueSoonBalance, 'PEN').isPositive();

                    return (
                      <tr key={row.customerId} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex flex-col gap-1">
                            <Link
                              href={`/customers/${row.customerId}`}
                              className="font-medium text-ink underline-offset-4 hover:underline"
                            >
                              {row.name}
                            </Link>
                            <span className="text-[13px] text-ink-soft tabular-nums">
                              {row.documentType} {row.documentNumber}
                            </span>
                            {row.suggestLowerLimit ? (
                              <Link
                                href={`/customers/${row.customerId}/terms`}
                                className="inline-flex items-center gap-1 text-[13px] font-medium text-error-ink hover:underline"
                              >
                                <TrendingDownIcon aria-hidden="true" className="size-4 shrink-0" />
                                {t('list.suggestLower')}
                              </Link>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <div className="flex flex-col items-start gap-1.5">
                            <ScoreBreakdownPopover
                              breakdown={row.scoreBreakdown}
                              suggestLowerLimit={row.suggestLowerLimit}
                            />
                            {row.isDelinquent ? (
                              <span className="text-[13px] font-medium text-error-ink">
                                {t('list.delinquent')}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right align-top">
                          <div className="flex flex-col items-end gap-0.5">
                            <Money
                              amount={row.currentBalance}
                              currency="PEN"
                              className="font-semibold text-ink"
                            />
                            {overduePositive ? (
                              <span className="text-[13px] text-error-ink">
                                {t('list.overdueLabel')}{' '}
                                <Money amount={row.overdueBalance} currency="PEN" />
                              </span>
                            ) : dueSoonPositive ? (
                              <span className="text-[13px] text-amber-ink">
                                {t('list.dueSoonLabel')}{' '}
                                <Money amount={row.dueSoonBalance} currency="PEN" />
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right align-top">
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-baseline gap-2">
                              <Money amount={row.creditLimit} currency="PEN" className="text-ink" />
                              <span className="text-[13px] text-ink-soft tabular-nums">
                                {Math.round(row.utilizationPct)}%
                              </span>
                            </div>
                            <div
                              aria-hidden="true"
                              className="h-1.5 w-24 overflow-hidden rounded-full bg-paper-deep"
                            >
                              <div
                                className={cn('h-full rounded-full', utilizationBarClass(row))}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          {row.isDelinquent ? (
                            <span className="text-[13px] font-medium text-error-ink tabular-nums">
                              {t('list.daysOverdue', { days: row.maxDaysOverdue })}
                            </span>
                          ) : row.nextDueDate ? (
                            <span className="text-[13px] text-ink-soft tabular-nums">
                              {formatDate(row.nextDueDate)}
                            </span>
                          ) : (
                            <span className="text-[13px] text-ink-soft">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right align-top">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {canCollect && row.payableCyclesCount > 0 ? (
                              <Link
                                href={`/customers/${row.customerId}/pay`}
                                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                              >
                                {t('actions.collect')}
                              </Link>
                            ) : null}
                            {canAdjustTerms ? (
                              <Link
                                href={`/customers/${row.customerId}/terms`}
                                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                              >
                                {t('actions.adjustLimit')}
                              </Link>
                            ) : null}
                            {canReadCustomers ? (
                              <Link
                                href={`/customers/${row.customerId}`}
                                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                              >
                                {t('actions.viewProfile')}
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
