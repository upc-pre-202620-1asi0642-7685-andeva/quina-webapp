'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import type { DailySales } from '@/infrastructure/db/queries/sales';
import { formatMoney, Money } from '@/presentation/components/money';
import { cn } from '@/presentation/lib/utils';
import { PeriodSegmentedControl, QuinaChartTooltip } from './chart-primitives';
import { useWidgetDimensions } from './widget-size';

const SERIES = [
  { key: 'cash', color: 'var(--color-success)' },
  { key: 'credit', color: 'var(--color-soft-ink-2)' },
] as const;

type WindowKey = '7' | '14' | '30';

/** Ventas de los últimos 7, 14 o 30 días, contado y fiado apilados. */
export function SalesWeekChart({ days }: { days: DailySales[] }) {
  const t = useTranslations('Dashboard.widgets.salesWeek');
  const tc = useTranslations('Dashboard.charts');
  const locale = useLocale();
  const { size, rows } = useWidgetDimensions();
  const [windowKey, setWindowKey] = useState<WindowKey>('7');

  const count = size === 'sm' && rows === 1 ? 7 : Number(windowKey);
  const visibleDays = days.slice(-Math.min(count, days.length));

  const sumPen = (values: string[]) =>
    MoneyValue.sum(
      values.map((v) => MoneyValue.of(v, 'PEN')),
      'PEN',
    ).toFixed2();
  const cashTotal = sumPen(visibleDays.map((d) => d.cash));
  const creditTotal = sumPen(visibleDays.map((d) => d.credit));
  const periodTotal = sumPen([cashTotal, creditTotal]);

  const intlLocale = locale === 'qu' ? 'es-PE' : locale;
  const axisLabel = (iso: string) => {
    const date = new Date(`${iso}T12:00:00-05:00`);
    if (visibleDays.length <= 7) {
      return new Intl.DateTimeFormat(intlLocale, {
        weekday: 'short',
        timeZone: 'America/Lima',
      }).format(date);
    }
    return new Intl.DateTimeFormat(intlLocale, {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(date);
  };
  const tooltipLabel = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${iso}T12:00:00-05:00`));

  // Recharts necesita números para dibujar; los totales y tabla usan texto exacto
  const data = visibleDays.map((d) => ({
    iso: d.day,
    label: axisLabel(d.day),
    cash: Number(d.cash),
    credit: Number(d.credit),
  }));

  const nameMap = { cash: t('cash'), credit: t('credit') };
  const compactMoney = (v: number) =>
    v >= 1000 ? `S/ ${(v / 1000).toFixed(1)}k` : `S/ ${Math.round(v)}`;

  return (
    <figure className="relative flex flex-1 flex-col justify-between gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Money amount={periodTotal} currency="PEN" className="text-3xl font-semibold text-ink" />
        {(size !== 'sm' || rows > 1) && days.length > 7 ? (
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
        ) : null}
      </div>

      <div
        aria-hidden="true"
        className={cn('w-full', rows === 2 ? (size === 'lg' ? 'h-64' : 'h-56') : 'h-32')}
      >
        <BarChart
          accessibilityLayer={false}
          responsive
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: size === 'sm' ? 0 : -8 }}
          style={{ width: '100%', height: '100%' }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="iso"
            axisLine={false}
            tickLine={false}
            minTickGap={visibleDays.length > 10 ? 18 : 4}
            tickFormatter={axisLabel}
            tick={{ fill: 'var(--color-ink-soft)', fontSize: 12 }}
          />
          {size !== 'sm' ? (
            <YAxis
              width={52}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(max, 100)]}
              tickFormatter={compactMoney}
              tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
            />
          ) : null}
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
          {SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="sales"
              fill={s.color}
              radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
          <dt className="text-ink-soft">{t('cash')}</dt>
          <dd>
            <Money amount={cashTotal} currency="PEN" className="font-medium text-ink" />
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-soft-ink-2" />
          <dt className="text-ink-soft">{t('credit')}</dt>
          <dd>
            <Money amount={creditTotal} currency="PEN" className="font-medium text-ink" />
          </dd>
        </div>
      </dl>

      {/* Los lectores de pantalla leen la misma información como tabla */}
      <div className="sr-only">
        <table>
          <caption>{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('day')}</th>
              <th scope="col">{t('cash')}</th>
              <th scope="col">{t('credit')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{formatMoney(d.cash, 'PEN')}</td>
                <td>{formatMoney(d.credit, 'PEN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
