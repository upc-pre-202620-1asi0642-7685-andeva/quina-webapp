'use client';

import type { ReactNode } from 'react';
import type { CashPaymentMethod } from '@/core/domain/sales/cash-payment';
import { Dec } from '@/core/domain/shared/decimal';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { cn } from '@/presentation/lib/utils';
import { useWidgetDimensions, useWidgetSize } from './widget-size';

const COMPACT_ROW_LIMIT = 3;

/**
 * En alto compacto (`rows === 1`) muestra hasta 3 filas para que encaje limpio;
 * al estirar hacia abajo (`rows === 2`) muestra todas las filas disponibles (hasta 8).
 */
export function BentoList({
  items,
  moreOnCompact,
  moreOnExpanded,
  className,
}: {
  items: ReactNode[];
  moreOnCompact?: ReactNode;
  moreOnExpanded?: ReactNode;
  className?: string;
}) {
  const { size, rows } = useWidgetDimensions();
  const isCompact = rows === 1;
  const limit = isCompact ? COMPACT_ROW_LIMIT : items.length;
  const visible = items.slice(0, limit);
  const footer = isCompact ? moreOnCompact : moreOnExpanded;

  return (
    <>
      <ul
        className={cn(
          size === 'lg' && visible.length > 3
            ? 'grid grid-cols-1 gap-x-6 divide-y divide-line md:grid-cols-2'
            : 'flex flex-col divide-y divide-line',
          className,
        )}
      >
        {visible}
      </ul>
      {footer ? <p className="text-[13px] text-ink-soft">{footer}</p> : null}
    </>
  );
}

const CASH_BAR_COLORS: Record<CashPaymentMethod, string> = {
  CASH: 'var(--color-success)',
  YAPE: 'var(--color-link-active)',
  PLIN: 'var(--color-amber)',
  CARD: 'var(--color-ink-soft)',
};

/** Barra proporcional por medio de pago de contado dentro de Caja de hoy. */
export function CashMixBar({
  total,
  byMethod,
  labels,
  counts,
}: {
  total: string;
  byMethod: { method: CashPaymentMethod; total: string; count: number }[];
  labels: Record<CashPaymentMethod, string>;
  counts: Record<CashPaymentMethod, string>;
}) {
  const size = useWidgetSize();
  const totalDec = new Dec(total);
  const hasSales = MoneyValue.of(total, 'PEN').isPositive();

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-paper-deep"
      >
        {hasSales
          ? byMethod.map((row) => {
              const pct = new Dec(row.total).dividedBy(totalDec).times(100).toNumber();
              if (pct <= 0) return null;
              return (
                <div
                  key={row.method}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${pct}%`, background: CASH_BAR_COLORS[row.method] }}
                />
              );
            })
          : null}
      </div>
      {size !== 'sm' ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          {byMethod.map((row) => (
            <li key={row.method} className="inline-flex items-center gap-1.5 tabular-nums">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: CASH_BAR_COLORS[row.method] }}
              />
              {labels[row.method]}: {counts[row.method]}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
