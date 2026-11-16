'use client';

import { useState } from 'react';
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
import { Dec } from '@/core/domain/shared/decimal';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import type {
  DailyCashFlow,
  DailyPerformance,
  SalesByPaymentMethodResult,
} from '@/infrastructure/db/queries/dashboard-analytics';
import type { PortfolioMonth } from '@/infrastructure/db/queries/portfolio';
import { formatMoney, Money } from '@/presentation/components/money';
import { cn } from '@/presentation/lib/utils';
import { PeriodSegmentedControl, QuinaChartTooltip } from './chart-primitives';
import { useWidgetDimensions } from './widget-size';

const sumPen = (values: string[]) =>
  MoneyValue.sum(
    values.map((v) => MoneyValue.of(v, 'PEN')),
    'PEN',
  ).toFixed2();

const compactMoney = (v: number) =>
  v >= 1000 ? `S/ ${(v / 1000).toFixed(1)}k` : `S/ ${Math.round(v)}`;

/* =============================================================================
 * 1. Ingresos reales vs. Compras (`cashFlow`)
 * ============================================================================= */

export function CashFlowChart({ days }: { days: DailyCashFlow[] }) {
  const t = useTranslations('Dashboard.widgets.cashFlow');
  const tc = useTranslations('Dashboard.charts');
  const locale = useLocale();
  const { size, rows } = useWidgetDimensions();
  const [windowKey, setWindowKey] = useState<'7' | '14' | '30'>(size === 'lg' ? '30' : '14');

  const count = Number(windowKey);
  const visible = days.slice(-Math.min(count, days.length));

  const cashTotal = sumPen(visible.map((d) => d.cashSales));
  const collectionsTotal = sumPen(visible.map((d) => d.debtCollections));
  const incomeTotal = sumPen([cashTotal, collectionsTotal]);
  const purchasesTotal = sumPen(visible.map((d) => d.purchases));
  const netFlowValue = MoneyValue.of(incomeTotal, 'PEN').minus(
    MoneyValue.of(purchasesTotal, 'PEN'),
  );
  const netTotal = netFlowValue.toFixed2();

  const intlLocale = locale === 'qu' ? 'es-PE' : locale;
  const formatDay = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${iso}T12:00:00-05:00`));
  const tooltipLabel = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${iso}T12:00:00-05:00`));

  const data = visible.map((d) => ({
    iso: d.day,
    realIncome: Number(d.realIncome),
    purchases: Number(d.purchases),
  }));

  const nameMap = {
    realIncome: t('realIncome'),
    purchases: t('purchases'),
  };

  return (
    <figure className="relative flex flex-1 flex-col justify-between gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-3 py-2">
            <dt className="text-xs text-ink-soft">{t('realIncome')}</dt>
            <dd>
              <Money
                amount={incomeTotal}
                currency="PEN"
                className="text-base font-semibold text-ink"
              />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-3 py-2">
            <dt className="text-xs text-ink-soft">{t('purchases')}</dt>
            <dd>
              <Money
                amount={purchasesTotal}
                currency="PEN"
                className="text-base font-semibold text-ink"
              />
            </dd>
          </div>
          <div
            className={cn(
              'flex flex-col gap-0.5 rounded-field px-3 py-2',
              netFlowValue.isNegative()
                ? 'bg-error/12 text-error-ink'
                : netFlowValue.isPositive()
                  ? 'bg-soft text-soft-ink'
                  : 'bg-paper-deep text-ink-soft',
            )}
          >
            <dt className="text-xs">{t('netFlow')}</dt>
            <dd>
              <Money amount={netTotal} currency="PEN" className="text-base font-semibold" />
            </dd>
          </div>
        </dl>

        <PeriodSegmentedControl
          ariaLabel={tc('periodAria')}
          value={windowKey}
          onChange={setWindowKey}
          options={[
            { value: '7', label: tc('days7') },
            { value: '14', label: tc('days14') },
            { value: '30', label: tc('days30') },
          ]}
        />
      </div>

      <div
        aria-hidden="true"
        className={cn('w-full', rows === 2 ? (size === 'lg' ? 'h-64' : 'h-56') : 'h-32')}
      >
        <BarChart
          accessibilityLayer={false}
          responsive
          data={data}
          margin={{ top: 8, right: 6, bottom: 0, left: -8 }}
          style={{ width: '100%', height: '100%' }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="iso"
            axisLine={false}
            tickLine={false}
            minTickGap={18}
            tickFormatter={formatDay}
            tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
          />
          <YAxis
            width={52}
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
                labelFormatter={tooltipLabel}
                nameMap={nameMap}
              />
            )}
          />
          <Bar dataKey="realIncome" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="purchases" fill="var(--color-amber)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
            {t('realIncomeHint', {
              cash: formatMoney(cashTotal, 'PEN'),
              collections: formatMoney(collectionsTotal, 'PEN'),
            })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-amber" />
            {t('purchases')}
          </span>
        </div>
      </div>

      <div className="sr-only">
        <table>
          <caption>{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{tc('day')}</th>
              <th scope="col">{t('realIncome')}</th>
              <th scope="col">{t('purchases')}</th>
              <th scope="col">{t('netFlow')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{formatMoney(d.realIncome, 'PEN')}</td>
                <td>{formatMoney(d.purchases, 'PEN')}</td>
                <td>{formatMoney(d.netFlow, 'PEN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/* =============================================================================
 * 2. Medios de pago (`salesByMethod`)
 * ============================================================================= */

const METHOD_COLORS = {
  CASH: 'var(--color-success)',
  YAPE: 'var(--color-link-active)',
  PLIN: 'var(--color-amber)',
  CARD: 'var(--color-ink-soft)',
  CREDIT: 'var(--color-soft-ink-2)',
} as const;

export function PaymentMethodsChart({ data }: { data: SalesByPaymentMethodResult }) {
  const t = useTranslations('Dashboard.widgets.salesByMethod');
  const tc = useTranslations('Dashboard.charts');
  const { size, rows } = useWidgetDimensions();
  const [period, setPeriod] = useState<'7' | '30'>('7');

  const slices = period === '7' ? data.last7Days : data.last30Days;
  const total = period === '7' ? data.total7Days : data.total30Days;
  const totalDec = new Dec(total);

  const nonZero = slices.filter((s) => MoneyValue.of(s.total, 'PEN').isPositive());
  const chartData = nonZero.map((s) => ({
    key: s.method,
    name: t(`methods.${s.method}`),
    value: Number(s.total),
    color: METHOD_COLORS[s.method],
  }));

  const nameMap = Object.fromEntries(slices.map((s) => [s.method, t(`methods.${s.method}`)]));
  const visibleSlices = rows === 1 && size === 'sm' ? slices.slice(0, 3) : slices;

  return (
    <figure className="relative flex flex-1 flex-col justify-between gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Money amount={total} currency="PEN" className="text-3xl font-semibold text-ink" />
        <PeriodSegmentedControl
          ariaLabel={tc('periodAria')}
          value={period}
          onChange={setPeriod}
          options={[
            { value: '7', label: tc('days7') },
            { value: '30', label: tc('days30') },
          ]}
        />
      </div>

      {nonZero.length === 0 ? (
        <p className="rounded-field bg-paper-deep px-4 py-5 text-sm text-ink-soft">{t('empty')}</p>
      ) : (
        <div
          className={cn(
            'grid items-center gap-4',
            size === 'sm' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[150px_1fr]',
          )}
        >
          {size === 'sm' && rows === 1 ? null : (
            <div
              aria-hidden="true"
              className={cn('mx-auto w-full', rows === 2 ? 'h-44 max-w-44' : 'h-32 max-w-36')}
            >
              <PieChart responsive style={{ width: '100%', height: '100%' }}>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={rows === 2 ? 44 : 34}
                  outerRadius={rows === 2 ? 68 : 54}
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
          )}

          <ul className="flex flex-col gap-2">
            {visibleSlices.map((s) => {
              const amountDec = new Dec(s.total);
              const pct = totalDec.isZero()
                ? 0
                : Math.round(amountDec.dividedBy(totalDec).times(100).toNumber());
              return (
                <li key={s.method} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-ink">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: METHOD_COLORS[s.method] }}
                      />
                      {t(`methods.${s.method}`)}
                      <span className="text-ink-soft tabular-nums">({s.count})</span>
                    </span>
                    <span className="font-medium text-ink tabular-nums">
                      {formatMoney(s.total, 'PEN')} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${pct}%`, background: METHOD_COLORS[s.method] }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="sr-only">
        <table>
          <caption>{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('method')}</th>
              <th scope="col">{t('salesCount')}</th>
              <th scope="col">{t('amount')}</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr key={s.method}>
                <th scope="row">{t(`methods.${s.method}`)}</th>
                <td>{s.count}</td>
                <td>{formatMoney(s.total, 'PEN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/* =============================================================================
 * 3. Evolución de cartera (`portfolioTrend`)
 * ============================================================================= */

const PORTFOLIO_SERIES = [
  { key: 'billed', color: 'var(--color-soft-ink-2)' },
  { key: 'paid', color: 'var(--color-success)' },
  { key: 'overdue', color: 'var(--color-error)' },
] as const;

export function PortfolioTrendChart({ months }: { months: PortfolioMonth[] }) {
  const t = useTranslations('Portfolio.chart');
  const { size, rows } = useWidgetDimensions();
  const data = months.map((m) => ({
    period: m.period,
    billed: Number(m.billed),
    paid: Number(m.paid),
    overdue: Number(m.overdue),
  }));
  const nameMap = {
    billed: t('billed'),
    paid: t('paid'),
    overdue: t('overdue'),
  };

  return (
    <figure className="relative flex flex-1 flex-col justify-between gap-3">
      <div
        aria-hidden="true"
        className={cn('w-full', rows === 2 ? (size === 'lg' ? 'h-64' : 'h-56') : 'h-36')}
      >
        <BarChart
          accessibilityLayer={false}
          responsive
          data={data}
          margin={{ top: 8, right: 6, bottom: 0, left: -8 }}
          style={{ width: '100%', height: '100%' }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
          />
          <YAxis
            width={52}
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
                nameMap={nameMap}
              />
            )}
          />
          {PORTFOLIO_SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {PORTFOLIO_SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-ink-soft">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ background: s.color }}
            />
            {t(s.key)}
          </li>
        ))}
      </ul>

      <div className="sr-only">
        <table>
          <caption>{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('period')}</th>
              {PORTFOLIO_SERIES.map((s) => (
                <th key={s.key} scope="col">
                  {t(s.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.period}>
                <th scope="row">{m.period}</th>
                {PORTFOLIO_SERIES.map((s) => (
                  <td key={s.key}>{formatMoney(m[s.key], 'PEN')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/* =============================================================================
 * 4. Ventas y ganancia diaria (`marginTrend`)
 * ============================================================================= */

export function MarginTrendChart({ days }: { days: DailyPerformance[] }) {
  const t = useTranslations('Dashboard.widgets.marginTrend');
  const tc = useTranslations('Dashboard.charts');
  const locale = useLocale();
  const { size, rows } = useWidgetDimensions();
  const [windowKey, setWindowKey] = useState<'14' | '30'>(size === 'lg' ? '30' : '14');

  const count = Number(windowKey);
  const visible = days.slice(-Math.min(count, days.length));
  const salesTotal = sumPen(visible.map((d) => d.total));
  const marginTotal = sumPen(visible.map((d) => d.grossMargin));
  const salesDec = new Dec(salesTotal);
  const marginPct = salesDec.isZero()
    ? 0
    : Math.round(new Dec(marginTotal).dividedBy(salesDec).times(100).toNumber());

  const intlLocale = locale === 'qu' ? 'es-PE' : locale;
  const formatDay = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${iso}T12:00:00-05:00`));
  const tooltipLabel = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${iso}T12:00:00-05:00`));

  const data = visible.map((d) => ({
    iso: d.day,
    total: Number(d.total),
    grossMargin: Number(d.grossMargin),
  }));

  const nameMap = {
    total: t('sales'),
    grossMargin: t('margin'),
  };

  return (
    <figure className="relative flex flex-1 flex-col justify-between gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-ink-soft">{t('sales')}</span>
            <Money amount={salesTotal} currency="PEN" className="text-2xl font-semibold text-ink" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-ink-soft">{t('margin')}</span>
            <span className="flex items-baseline gap-1.5">
              <Money
                amount={marginTotal}
                currency="PEN"
                className="text-2xl font-semibold text-success-ink"
              />
              <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-semibold text-soft-ink tabular-nums">
                {marginPct}%
              </span>
            </span>
          </div>
        </div>

        <PeriodSegmentedControl
          ariaLabel={tc('periodAria')}
          value={windowKey}
          onChange={setWindowKey}
          options={[
            { value: '14', label: tc('days14') },
            { value: '30', label: tc('days30') },
          ]}
        />
      </div>

      <div
        aria-hidden="true"
        className={cn('w-full', rows === 2 ? (size === 'lg' ? 'h-64' : 'h-56') : 'h-36')}
      >
        <AreaChart
          accessibilityLayer={false}
          responsive
          data={data}
          margin={{ top: 8, right: 6, bottom: 0, left: -8 }}
          style={{ width: '100%', height: '100%' }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="iso"
            axisLine={false}
            tickLine={false}
            minTickGap={18}
            tickFormatter={formatDay}
            tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
          />
          <YAxis
            width={52}
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
                labelFormatter={tooltipLabel}
                nameMap={nameMap}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--color-ink-soft)"
            strokeWidth={2}
            fill="var(--color-paper-deep)"
            fillOpacity={0.8}
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
      </div>

      <div className="sr-only">
        <table>
          <caption>{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{tc('day')}</th>
              <th scope="col">{t('sales')}</th>
              <th scope="col">{t('margin')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{formatMoney(d.total, 'PEN')}</td>
                <td>{formatMoney(d.grossMargin, 'PEN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
