'use client';

import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortfolioMonth } from '@/infrastructure/db/queries/portfolio';
import { QuinaChartTooltip } from '@/presentation/components/dashboard/chart-primitives';
import { formatMoney } from '@/presentation/components/money';

// DESIGN.md §2.4: liquidado (por pagar), pagado (al día) y vencido (en mora)
const SERIES = [
  { key: 'billed', color: 'var(--color-soft-ink-2)' },
  { key: 'paid', color: 'var(--color-success)' },
  { key: 'overdue', color: 'var(--color-error)' },
] as const;

const compactMoney = (v: number) =>
  v >= 1000 ? `S/ ${(v / 1000).toFixed(1)}k` : `S/ ${Math.round(v)}`;

/** US19 crit. 6: evolución de la cartera, los últimos 6 meses de corte. */
export function PortfolioChart({ months }: { months: PortfolioMonth[] }) {
  const t = useTranslations('Portfolio.chart');
  // Recharts necesita números para dibujar; los montos siguen en texto en la tabla
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
      <div aria-hidden="true" className="h-64 w-full">
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
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {SERIES.map((s) => (
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

      {/* Los lectores de pantalla leen la misma información como tabla */}
      <div className="sr-only">
        <table>
          <caption>{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('period')}</th>
              {SERIES.map((s) => (
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
                {SERIES.map((s) => (
                  <td key={s.key}>{formatMoney(m[s.key], 'PEN')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="text-[13px] text-ink-soft">{t('caption')}</figcaption>
    </figure>
  );
}
