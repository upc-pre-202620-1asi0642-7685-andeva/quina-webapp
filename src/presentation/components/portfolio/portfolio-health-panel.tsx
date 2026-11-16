import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dec } from '@/core/domain/shared/decimal';
import {
  AGING_BUCKETS,
  PORTFOLIO_BANDS,
  portfolioHref,
  type AgingBucket,
  type BucketSummary,
  type PortfolioBandKey,
  type PortfolioQuery,
} from '@/infrastructure/db/queries/portfolio';
import { Money } from '@/presentation/components/money';
import { cn } from '@/presentation/lib/utils';

const BAND_META: Record<PortfolioBandKey, { style: string; icon: typeof CircleCheckIcon }> = {
  GREEN: { style: 'bg-success/12 text-success-ink', icon: CircleCheckIcon },
  YELLOW: { style: 'bg-amber/12 text-amber-ink', icon: TriangleAlertIcon },
  RED: { style: 'bg-error/12 text-error-ink', icon: CircleAlertIcon },
  NO_HISTORY: { style: 'bg-paper-deep text-ink-soft', icon: CircleDashedIcon },
};

const AGING_BAR_COLOR: Record<AgingBucket, string> = {
  current: 'bg-success',
  dueSoon: 'bg-amber',
  d1_15: 'bg-error',
  d16_30: 'bg-error',
  d31_plus: 'bg-error',
};

export async function PortfolioHealthPanel({
  bands,
  aging,
  totalLent,
  query,
}: {
  bands: Record<PortfolioBandKey, BucketSummary>;
  aging: Record<AgingBucket, BucketSummary>;
  totalLent: string;
  query: PortfolioQuery;
}) {
  const t = await getTranslations('Portfolio.health');
  const totalDec = new Dec(totalLent);

  return (
    <section
      aria-labelledby="health-title"
      className="flex flex-col justify-between gap-5 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="health-title" className="text-lg font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </div>

      {/* Distribución por categoría de puntaje */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium text-ink-soft">{t('bandsTitle')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {PORTFOLIO_BANDS.map((bandKey) => {
            const summary = bands[bandKey];
            const active = query.band === bandKey;
            const { style, icon: Icon } = BAND_META[bandKey];
            return (
              <Link
                key={bandKey}
                href={portfolioHref(query, { band: active ? null : bandKey })}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 items-center justify-between gap-2 rounded-full px-3 py-2 text-[13px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
                  style,
                  active && 'ring-2 ring-link-active',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{t(`bands.${bandKey}`)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{summary.count}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Antigüedad de la cartera */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium text-ink-soft">{t('agingTitle')}</h3>
        <ul className="flex flex-col gap-1.5">
          {AGING_BUCKETS.map((bucket) => {
            const summary = aging[bucket];
            const active = query.aging === bucket;
            const amountDec = new Dec(summary.amount);
            const pct = totalDec.isZero()
              ? 0
              : Math.min(
                  100,
                  amountDec.dividedBy(totalDec).times(100).toDecimalPlaces(1).toNumber(),
                );
            const widthPct = amountDec.greaterThan(0) ? Math.max(pct, 3) : 0;

            return (
              <li key={bucket}>
                <Link
                  href={portfolioHref(query, { aging: active ? null : bucket })}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex min-h-11 flex-col justify-center gap-1.5 rounded-field border px-3 py-2 transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active',
                    active
                      ? 'border-link-active bg-soft text-soft-ink'
                      : 'border-transparent bg-paper-deep/60 text-ink hover:bg-surface-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span>{t(`aging.${bucket}`)}</span>
                      <span
                        className={cn(
                          'text-[13px] tabular-nums',
                          active ? 'text-soft-ink-2' : 'text-ink-soft',
                        )}
                      >
                        ({summary.count})
                      </span>
                    </span>
                    <Money amount={summary.amount} currency="PEN" className="font-semibold" />
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-1.5 w-full overflow-hidden rounded-full bg-paper-deep"
                  >
                    <div
                      className={cn('h-full rounded-full', AGING_BAR_COLOR[bucket])}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
