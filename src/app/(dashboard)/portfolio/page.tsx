import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowDownWideNarrowIcon, LockIcon, TrendingDownIcon } from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { loadPortfolio, type PortfolioRow } from '@/infrastructure/db/queries/portfolio';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { PortfolioChart } from '@/presentation/components/portfolio/portfolio-chart';
import { ScoreBadge } from '@/presentation/components/portfolio/score-badge';
import { buttonVariants } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

const SORTS = ['debt', 'score'] as const;
type Sort = (typeof SORTS)[number];

// US19 crit. 5: por defecto, de mayor a menor deuda; también del puntaje más bajo al más alto
const COMPARE: Record<Sort, (a: PortfolioRow, b: PortfolioRow) => number> = {
  debt: (a, b) =>
    MoneyValue.of(b.currentBalance, 'PEN').compare(MoneyValue.of(a.currentBalance, 'PEN')) ||
    a.name.localeCompare(b.name),
  score: (a, b) => a.score - b.score || a.name.localeCompare(b.name),
};

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const user = await requireStoreUser('/portfolio', 'reports.view');
  const t = await getTranslations('Portfolio');
  const tPlans = await getTranslations('Plans');
  const { sort: rawSort } = await searchParams;
  const sort: Sort = SORTS.includes(rawSort as Sort) ? (rawSort as Sort) : 'debt';
  const [store, portfolio] = await Promise.all([
    loadStoreContext(user.storeId),
    loadPortfolio(user.storeId, new Date()),
  ]);
  // D1: el gráfico es de la vista avanzada (Pro y Plus)
  const advanced = PlanLimits.of(store.tier).features.reportsExport;
  const rows = [...portfolio.rows].sort(COMPARE[sort]);
  const { metrics } = portfolio;

  const cards = [
    { key: 'lent', value: <Money amount={metrics.lent} currency="PEN" /> },
    { key: 'overdue', value: <Money amount={metrics.overdue} currency="PEN" /> },
    { key: 'projected', value: <Money amount={metrics.projected} currency="PEN" /> },
    {
      key: 'delinquent',
      value: <span className="tabular-nums">{metrics.delinquentCustomers}</span>,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>

      {/* US19 crit. 1: las cuatro métricas clave */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4"
          >
            <dt className="text-[13px] text-ink-soft">{t(`metrics.${card.key}`)}</dt>
            <dd className="text-xl font-semibold text-ink">{card.value}</dd>
          </div>
        ))}
      </dl>

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
              <Link href="/settings#plans" className="font-medium text-link-active hover:underline">
                {t('chart.seePlans')}
              </Link>
            </span>
          </p>
        )}
      </section>

      <section aria-labelledby="customers-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="customers-title" className="text-lg font-semibold text-ink">
            {t('list.title')}
          </h2>
          <nav aria-label={t('list.sortLabel')} className="flex gap-2">
            {SORTS.map((option) => (
              <Link
                key={option}
                href={option === 'debt' ? '/portfolio' : `/portfolio?sort=${option}`}
                aria-current={sort === option ? 'true' : undefined}
                className={cn(
                  buttonVariants({
                    variant: sort === option ? 'default' : 'secondary',
                    size: 'sm',
                  }),
                )}
              >
                <ArrowDownWideNarrowIcon aria-hidden="true" />
                {t(`list.sort.${option}`)}
              </Link>
            ))}
          </nav>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-6 py-10 text-center text-sm text-ink-soft">
            {t('list.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {rows.map((row) => (
              <li
                key={row.customerId}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={`/customers/${row.customerId}`}
                    className="truncate font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <ScoreBadge score={row.score} band={row.band} hasHistory={row.hasHistory} />
                    {row.isDelinquent ? (
                      <span className="text-[13px] font-medium text-error-ink">
                        {t('list.delinquent')}
                      </span>
                    ) : null}
                  </div>
                  {/* US19 crit. 4: solo sugiere; el dueño decide en las condiciones */}
                  {row.suggestLowerLimit ? (
                    <Link
                      href={`/customers/${row.customerId}/terms`}
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-error-ink hover:underline"
                    >
                      <TrendingDownIcon aria-hidden="true" className="size-4" />
                      {t('list.suggestLower')}
                    </Link>
                  ) : null}
                </div>
                <dl className="flex gap-6 text-sm sm:text-right">
                  <div className="flex flex-col">
                    <dt className="text-[13px] text-ink-soft">{t('list.debt')}</dt>
                    <dd className="font-semibold text-ink">
                      <Money amount={row.currentBalance} currency="PEN" />
                    </dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-[13px] text-ink-soft">{t('list.limit')}</dt>
                    <dd className="text-ink">
                      <Money amount={row.creditLimit} currency="PEN" />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
