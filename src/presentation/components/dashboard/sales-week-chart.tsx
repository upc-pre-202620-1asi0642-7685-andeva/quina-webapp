'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Bar, BarChart, Tooltip, XAxis } from 'recharts';
import type { DailySales } from '@/infrastructure/db/queries/sales';
import { formatMoney } from '@/presentation/components/money';

const SERIES = [
  { key: 'cash', color: 'var(--color-success)' },
  { key: 'credit', color: 'var(--color-soft-ink-2)' },
] as const;

/** Ventas de los últimos 7 días, contado y fiado apilados. */
export function SalesWeekChart({ days }: { days: DailySales[] }) {
  const t = useTranslations('Dashboard.widgets.salesWeek');
  const locale = useLocale();
  // El día de Lima se muestra al mediodía para no cruzar de fecha
  const weekday = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'qu' ? 'es-PE' : locale, {
      weekday: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(`${iso}T12:00:00-05:00`));
  // Recharts necesita números para dibujar; los montos siguen en texto en la tabla
  const data = days.map((d) => ({
    label: weekday(d.day),
    cash: Number(d.cash),
    credit: Number(d.credit),
  }));
  const money = (value: unknown) => formatMoney(Number(value).toFixed(2), 'PEN');

  return (
    <figure className="flex flex-col">
      <div aria-hidden="true" className="h-32 w-full">
        <BarChart
          accessibilityLayer={false}
          responsive
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          style={{ width: '100%', height: '100%' }}
        >
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-ink-soft)', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-hover)' }}
            formatter={(value, name) => [money(value), t(name as (typeof SERIES)[number]['key'])]}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-line)',
              borderRadius: 12,
              color: 'var(--color-ink)',
            }}
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
      {/* Los lectores de pantalla leen la misma información como tabla */}
      <table className="sr-only">
        <caption>{t('caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('day')}</th>
            <th scope="col">{t('cash')}</th>
            <th scope="col">{t('credit')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{formatMoney(d.cash, 'PEN')}</td>
              <td>{formatMoney(d.credit, 'PEN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
