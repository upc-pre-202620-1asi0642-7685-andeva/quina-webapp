'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type { Currency } from '@/core/domain/shared/money';
import type { InstallmentRow } from '@/infrastructure/db/queries/portal';
import { formatMoney, Money } from '@/presentation/components/money';
import { Button } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

// DESIGN.md §2.4: los mismos colores de estado que los ciclos
const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-paper-deep text-ink-soft',
  PAID: 'bg-success/12 text-success-ink',
  OVERDUE: 'bg-error/12 text-error-ink',
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-[15px] font-medium whitespace-nowrap',
        STATUS_STYLES[status] ?? STATUS_STYLES.PENDING,
      )}
    >
      {label}
    </span>
  );
}

const INITIAL_MOBILE_ROWS = 4;

export function InstallmentScheduleList({
  rows,
  currency,
}: {
  rows: InstallmentRow[];
  currency: Currency;
}) {
  const t = useTranslations('Portal.installments');
  const [expanded, setExpanded] = useState(false);

  const statusLabel = (status: string) =>
    t(`statuses.${status === 'PAID' || status === 'OVERDUE' ? status : 'PENDING'}`);

  const nextDueIndex = rows.findIndex(
    (row) => row.status === 'OVERDUE' || row.status === 'PENDING',
  );
  const canCollapse = rows.length > INITIAL_MOBILE_ROWS;
  const visibleRows = (() => {
    if (!canCollapse || expanded) return rows;
    if (nextDueIndex <= 0) return rows.slice(0, INITIAL_MOBILE_ROWS);
    const start = Math.max(0, Math.min(nextDueIndex, rows.length - INITIAL_MOBILE_ROWS));
    return rows.slice(start, start + INITIAL_MOBILE_ROWS);
  })();

  return (
    <div className="flex flex-col gap-3 sm:hidden">
      {/* Seis columnas no caben en 390 px: en el celular cada cuota es una fila con su desglose */}
      <ul className="flex flex-col divide-y divide-line rounded-field border border-line">
        {visibleRows.map((row, idx) => {
          const isNext = nextDueIndex !== -1 && rows[nextDueIndex]?.number === row.number;
          return (
            <li
              key={row.number}
              className={cn(
                'flex flex-col gap-1 px-4 py-3',
                isNext && (row.status === 'OVERDUE' ? 'bg-error/6' : 'bg-soft/40'),
                idx === 0 && 'rounded-t-field',
                idx === visibleRows.length - 1 && 'rounded-b-field',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink tabular-nums">
                  {t('row', { number: row.number, total: row.total })}
                </span>
                <Money
                  amount={row.installment}
                  currency={currency}
                  className="font-semibold whitespace-nowrap text-ink"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink-soft">
                  {t('dueOn', { date: formatDate(row.dueDate) })}
                </span>
                <StatusBadge status={row.status} label={statusLabel(row.status)} />
              </div>
              <span className="text-base text-ink-soft">
                {t('breakdown', {
                  principal: formatMoney(row.principal, currency),
                  interest: formatMoney(row.interest, currency),
                })}
              </span>
            </li>
          );
        })}
      </ul>
      {canCollapse ? (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full"
        >
          {expanded ? (
            <>
              <ChevronUpIcon aria-hidden="true" />
              <span>{t('showLess')}</span>
            </>
          ) : (
            <>
              <ChevronDownIcon aria-hidden="true" />
              <span>{t('showAll', { count: rows.length })}</span>
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
