'use client';

import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortfolioMonth } from '@/infrastructure/db/queries/portfolio';
import { formatMoney } from '@/presentation/components/money';

// DESIGN.md §2.4: liquidado (por pagar), pagado (al día) y vencido (en mora)
const SERIES = [
  { key: 'billed', color: 'var(--color-soft-ink-2)' },
  { key: 'paid', color: 'var(--color-success)' },
  { key: 'overdue', color: 'var(--color-error)' },
] as const;

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
  const money = (value: unknown) => formatMoney(Number(value).toFixed(2), 'PEN');

  return (
    <figure className="flex flex-col gap-3">
      <div aria-hidden="true" className="h-64 w-full overflow-x-auto">
        <BarChart
          responsive
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          style={{ width: '100%', height: '100%', minWidth: 320 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="period" tick={{ fill: 'var(--color-ink-soft)', fontSize: 12 }} />
          <YAxis
            width={72}
            tick={{ fill: 'var(--color-ink-soft)', fontSize: 12 }}
            tickFormatter={money}
          />
          <Tooltip
            formatter={(value, name) => [money(value), t(name as (typeof SERIES)[number]['key'])]}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-line)',
              borderRadius: 12,
              color: 'var(--color-ink)',
            }}
          />
          <Legend formatter={(name) => t(name as (typeof SERIES)[number]['key'])} />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </div>
      {/* Los lectores de pantalla leen la misma información como tabla */}
      <table className="sr-only">
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
      <figcaption className="text-[13px] text-ink-soft">{t('caption')}</figcaption>
    </figure>
  );
}
