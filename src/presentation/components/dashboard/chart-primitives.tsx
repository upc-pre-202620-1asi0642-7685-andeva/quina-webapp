'use client';

import type { ReactNode } from 'react';
import { formatMoney } from '@/presentation/components/money';
import { cn } from '@/presentation/lib/utils';

type TooltipItem = {
  dataKey?: string | number | ((obj: never) => unknown);
  name?: string | number;
  value?: string | number | readonly (string | number)[];
  color?: string;
};

/** Tooltip compacto y legible con tokens Quina para todos los gráficos del Dashboard. */
export function QuinaChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  nameMap,
  valueFormatter,
}: {
  active?: boolean;
  payload?: readonly TooltipItem[];
  label?: string | number;
  labelFormatter?: (label: string) => string;
  nameMap?: Record<string, string>;
  valueFormatter?: (value: number, key: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const formattedLabel =
    label !== undefined && label !== null
      ? labelFormatter
        ? labelFormatter(String(label))
        : String(label)
      : null;

  return (
    <div className="min-w-36 rounded-field border border-line bg-surface px-3 py-2 text-xs text-ink tabular-nums shadow-float">
      {formattedLabel ? (
        <p className="mb-1.5 border-b border-line pb-1 font-semibold text-ink">{formattedLabel}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {payload.map((entry, idx) => {
          const rawKey =
            typeof entry.dataKey === 'string' || typeof entry.dataKey === 'number'
              ? entry.dataKey
              : (entry.name ?? idx);
          const key = String(rawKey);
          const raw = Array.isArray(entry.value) ? entry.value[0] : entry.value;
          const num = Number(raw ?? 0);
          const displayName = nameMap?.[key] ?? String(entry.name ?? key);
          const formattedValue = valueFormatter
            ? valueFormatter(num, key)
            : formatMoney(num.toFixed(2), 'PEN');
          return (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: entry.color ?? 'var(--color-primary)' }}
                />
                {displayName}
              </span>
              <span className="font-semibold text-ink">{formattedValue}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Selector segmentado compacto para alternar ventanas de días (7d / 14d / 30d). */
export function PeriodSegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { value: T; label: ReactNode }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center rounded-full bg-paper-deep p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-h-8 rounded-full px-2.5 text-xs font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-link-active',
              active ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:text-ink',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
