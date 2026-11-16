'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyReportPoint, PaymentMethodBreakdown } from '@/core/domain/analytics/report';
import { Dec } from '@/core/domain/shared/decimal';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import {
  PeriodSegmentedControl,
  QuinaChartTooltip,
} from '@/presentation/components/dashboard/chart-primitives';
import { formatMoney, Money } from '@/presentation/components/money';

type BucketKind = 'day' | 'week' | 'month';

type ChartBucket = {
  key: string;
  startIso: string;
  endIso: string;
  totalSales: string;
  grossMargin: string;
  realIncome: string;
  purchases: string;
  netCashFlow: string;
};

const sumPen = (values: string[]) =>
  MoneyValue.sum(
    values.map((v) => MoneyValue.of(v, 'PEN')),
    'PEN',
  ).toFixed2();

const compactMoney = (v: number) =>
  v >= 1000 ? `S/ ${(v / 1000).toFixed(1)}k` : `S/ ${Math.round(v)}`;

function buildBuckets(series: DailyReportPoint[]): {
  kind: BucketKind;
  buckets: ChartBucket[];
} {
  if (series.length <= 45) {
    return {
      kind: 'day',
      buckets: series.map((d) => ({
        key: d.day,
        startIso: d.day,
        endIso: d.day,
        totalSales: d.totalSales,
        grossMargin: d.grossMargin,
        realIncome: MoneyValue.of(d.cashSales, 'PEN')
          .plus(MoneyValue.of(d.debtCollections, 'PEN'))
          .toFixed2(),
        purchases: d.purchases,
        netCashFlow: d.netCashFlow,
      })),
    };
  }

  const mergeGroup = (key: string, items: DailyReportPoint[]): ChartBucket => {
    const cashSales = sumPen(items.map((i) => i.cashSales));
    const debtCollections = sumPen(items.map((i) => i.debtCollections));
    const realIncome = MoneyValue.of(cashSales, 'PEN')
      .plus(MoneyValue.of(debtCollections, 'PEN'))
      .toFixed2();
    const purchases = sumPen(items.map((i) => i.purchases));
    return {
      key,
      startIso: items[0]!.day,
      endIso: items[items.length - 1]!.day,
      totalSales: sumPen(items.map((i) => i.totalSales)),
      grossMargin: sumPen(items.map((i) => i.grossMargin)),
      realIncome,
      purchases,
      netCashFlow: MoneyValue.of(realIncome, 'PEN')
        .minus(MoneyValue.of(purchases, 'PEN'))
        .toFixed2(),
    };
  };

  if (series.length <= 180) {
    const buckets: ChartBucket[] = [];
    for (let i = 0; i < series.length; i += 7) {
      const slice = series.slice(i, i + 7);
      buckets.push(mergeGroup(slice[0]!.day, slice));
    }
    return { kind: 'week', buckets };
  }

  const byMonth = new Map<string, DailyReportPoint[]>();
  for (const point of series) {
    const ym = point.day.slice(0, 7);
    const list = byMonth.get(ym);
    if (list) list.push(point);
    else byMonth.set(ym, [point]);
  }
  return {
    kind: 'month',
    buckets: Array.from(byMonth.entries()).map(([ym, items]) => mergeGroup(ym, items)),
  };
}

/** Gráfico de evolución diaria/semanal/mensual: Ventas vs. Margen o Flujo de caja real. */
export function ReportPerformanceChart({ dailySeries }: { dailySeries: DailyReportPoint[] }) {
  const t = useTranslations('Reports.charts.performance');
  const locale = useLocale();
  const [mode, setMode] = useState<'sales' | 'flow'>('sales');

  const intlLocale = locale === 'qu' ? 'es-PE' : locale;
  const { kind, buckets } = useMemo(() => buildBuckets(dailySeries), [dailySeries]);

  const bucketByKey = useMemo(() => new Map(buckets.map((b) => [b.key, b])), [buckets]);

  const formatDayShort = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${iso}T12:00:00-05:00`));

  const formatMonthShort = (ym: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      month: 'short',
      year: '2-digit',
      timeZone: 'America/Lima',
    }).format(new Date(`${ym}-15T12:00:00-05:00`));

  const formatAxisTick = (key: string) =>
    kind === 'month' ? formatMonthShort(key) : formatDayShort(key);

  const formatTooltipTitle = (key: string) => {
    const bucket = bucketByKey.get(key);
    if (!bucket) return key;
    if (kind === 'month') {
      return new Intl.DateTimeFormat(intlLocale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Lima',
      }).format(new Date(`${key}-15T12:00:00-05:00`));
    }
    if (kind === 'week' && bucket.startIso !== bucket.endIso) {
      return `${formatDayShort(bucket.startIso)} – ${formatDayShort(bucket.endIso)}`;
    }
    return new Intl.DateTimeFormat(intlLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${bucket.startIso}T12:00:00-05:00`));
  };

  const hasActivity = buckets.some(
    (b) =>
      MoneyValue.of(b.totalSales, 'PEN').isPositive() ||
      MoneyValue.of(b.realIncome, 'PEN').isPositive() ||
      MoneyValue.of(b.purchases, 'PEN').isPositive(),
  );

  const chartData = buckets.map((b) => ({
    key: b.key,
    totalSales: Number(b.totalSales),
    grossMargin: Number(b.grossMargin),
    realIncome: Number(b.realIncome),
    purchases: Number(b.purchases),
  }));

  const nameMap: Record<string, string> =
    mode === 'sales'
      ? { totalSales: t('series.sales'), grossMargin: t('series.margin') }
      : { realIncome: t('series.inflows'), purchases: t('series.purchases') };

  const groupingLabel =
    kind === 'month' ? t('groupedMonthly') : kind === 'week' ? t('groupedWeekly') : null;

  return (
    <section
      aria-labelledby="report-performance-title"
      className="flex min-w-0 flex-col justify-between gap-4 rounded-card border border-line bg-surface p-4 sm:p-6 lg:col-span-2 print:break-inside-avoid"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="report-performance-title" className="text-lg font-semibold text-ink">
            {t('title')}
          </h2>
          <p className="text-sm text-ink-soft">
            {mode === 'sales' ? t('salesSubtitle') : t('flowSubtitle')}
            {groupingLabel ? ` · ${groupingLabel}` : ''}
          </p>
        </div>

        <PeriodSegmentedControl
          ariaLabel={t('modeAria')}
          value={mode}
          onChange={setMode}
          className="print:hidden"
          options={[
            { value: 'sales', label: t('modes.sales') },
            { value: 'flow', label: t('modes.flow') },
          ]}
        />
      </div>

      {!hasActivity ? (
        <p className="flex min-h-44 items-center justify-center rounded-field bg-paper-deep px-4 py-8 text-center text-sm text-ink-soft">
          {t('empty')}
        </p>
      ) : (
        <figure className="relative flex flex-1 flex-col justify-between gap-3">
          <div aria-hidden="true" className="h-64 w-full min-w-0">
            {mode === 'sales' ? (
              <AreaChart
                accessibilityLayer={false}
                responsive
                data={chartData}
                margin={{ top: 8, right: 6, bottom: 0, left: -8 }}
                style={{ width: '100%', height: '100%' }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="key"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={22}
                  tickFormatter={formatAxisTick}
                  tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
                />
                <YAxis
                  width={54}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(max, 100)]}
                  tickFormatter={compactMoney}
                  tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
                />
                <Tooltip
                  allowEscapeViewBox={{ x: false, y: true }}
                  content={(props) => (
                    <QuinaChartTooltip
                      active={props.active}
                      payload={props.payload}
                      label={props.label}
                      labelFormatter={formatTooltipTitle}
                      nameMap={nameMap}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="totalSales"
                  stroke="var(--color-ink-soft)"
                  strokeWidth={2}
                  fill="var(--color-paper-deep)"
                  fillOpacity={0.85}
                />
                <Area
                  type="monotone"
                  dataKey="grossMargin"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  fill="var(--color-success)"
                  fillOpacity={0.18}
                />
              </AreaChart>
            ) : (
              <BarChart
                accessibilityLayer={false}
                responsive
                data={chartData}
                margin={{ top: 8, right: 6, bottom: 0, left: -8 }}
                style={{ width: '100%', height: '100%' }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="key"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={22}
                  tickFormatter={formatAxisTick}
                  tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
                />
                <YAxis
                  width={54}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(max, 100)]}
                  tickFormatter={compactMoney}
                  tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-hover)' }}
                  allowEscapeViewBox={{ x: false, y: true }}
                  content={(props) => (
                    <QuinaChartTooltip
                      active={props.active}
                      payload={props.payload}
                      label={props.label}
                      labelFormatter={formatTooltipTitle}
                      nameMap={nameMap}
                    />
                  )}
                />
                <Bar dataKey="realIncome" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" fill="var(--color-amber)" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </div>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-soft">
            {mode === 'sales' ? (
              <>
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-ink-soft" />
                  {t('series.sales')}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
                  {t('series.margin')}
                </li>
              </>
            ) : (
              <>
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
                  {t('series.inflows')}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-amber" />
                  {t('series.purchases')}
                </li>
              </>
            )}
          </ul>

          <div className="sr-only">
            <table>
              <caption>{t('caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('table.period')}</th>
                  <th scope="col">{t('series.sales')}</th>
                  <th scope="col">{t('series.margin')}</th>
                  <th scope="col">{t('series.inflows')}</th>
                  <th scope="col">{t('series.purchases')}</th>
                  <th scope="col">{t('table.netFlow')}</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">{formatTooltipTitle(b.key)}</th>
                    <td>{formatMoney(b.totalSales, 'PEN')}</td>
                    <td>{formatMoney(b.grossMargin, 'PEN')}</td>
                    <td>{formatMoney(b.realIncome, 'PEN')}</td>
                    <td>{formatMoney(b.purchases, 'PEN')}</td>
                    <td>{formatMoney(b.netCashFlow, 'PEN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      )}
    </section>
  );
}

const METHOD_COLORS = {
  CASH: 'var(--color-success)',
  YAPE: 'var(--color-link-active)',
  PLIN: 'var(--color-amber)',
  CARD: 'var(--color-ink-soft)',
  CREDIT: 'var(--color-soft-ink-2)',
} as const;

/** Gráfico de dona y barras de participación por medio de pago en el rango. */
export function ReportPaymentMethodsChart({
  paymentMethods,
}: {
  paymentMethods: PaymentMethodBreakdown[];
}) {
  const t = useTranslations('Reports.charts.paymentMethods');

  const total = sumPen(paymentMethods.map((m) => m.total));
  const totalDec = new Dec(total);
  const nonZero = paymentMethods.filter((m) => MoneyValue.of(m.total, 'PEN').isPositive());

  const chartData = nonZero.map((m) => ({
    key: m.method,
    name: t(`methods.${m.method}`),
    value: Number(m.total),
    color: METHOD_COLORS[m.method],
  }));

  const nameMap = Object.fromEntries(
    paymentMethods.map((m) => [m.method, t(`methods.${m.method}`)]),
  );

  return (
    <section
      aria-labelledby="report-methods-title"
      className="flex min-w-0 flex-col justify-between gap-4 rounded-card border border-line bg-surface p-4 sm:p-6 print:break-inside-avoid"
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="report-methods-title" className="text-lg font-semibold text-ink">
            {t('title')}
          </h2>
          <Money amount={total} currency="PEN" className="text-base font-semibold text-ink" />
        </div>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </div>

      {nonZero.length === 0 ? (
        <p className="flex min-h-44 items-center justify-center rounded-field bg-paper-deep px-4 py-8 text-center text-sm text-ink-soft">
          {t('empty')}
        </p>
      ) : (
        <figure className="relative flex flex-1 flex-col justify-between gap-4">
          <div aria-hidden="true" className="mx-auto h-44 w-full max-w-44">
            <PieChart responsive style={{ width: '100%', height: '100%' }}>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={44}
                outerRadius={68}
                paddingAngle={2}
                stroke="none"
              >
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={(props) => (
                  <QuinaChartTooltip
                    active={props.active}
                    payload={props.payload}
                    nameMap={nameMap}
                  />
                )}
              />
            </PieChart>
          </div>

          <ul className="flex flex-col gap-2.5">
            {paymentMethods.map((m) => {
              const amountDec = new Dec(m.total);
              const pct = totalDec.isZero()
                ? 0
                : Math.round(amountDec.dividedBy(totalDec).times(100).toNumber());
              return (
                <li key={m.method} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-ink">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: METHOD_COLORS[m.method] }}
                      />
                      {t(`methods.${m.method}`)}
                      <span className="text-ink-soft tabular-nums">({m.count})</span>
                    </span>
                    <span className="font-medium text-ink tabular-nums">
                      {formatMoney(m.total, 'PEN')} · {pct}%
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-1.5 overflow-hidden rounded-full bg-paper-deep"
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                      style={{ width: `${pct}%`, background: METHOD_COLORS[m.method] }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="sr-only">
            <table>
              <caption>{t('caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('table.method')}</th>
                  <th scope="col">{t('table.salesCount')}</th>
                  <th scope="col">{t('table.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethods.map((m) => (
                  <tr key={m.method}>
                    <th scope="row">{t(`methods.${m.method}`)}</th>
                    <td>{m.count}</td>
                    <td>{formatMoney(m.total, 'PEN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      )}
    </section>
  );
}
