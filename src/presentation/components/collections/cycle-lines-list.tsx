'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Currency } from '@/core/domain/shared/money';
import type { CycleDetailLine } from '@/infrastructure/db/queries/collections';
import { ChargeLine } from '@/presentation/components/collections/charge-line';
import { cn } from '@/presentation/lib/utils';

type LineFilter = 'all' | 'pending' | 'objected' | 'voided';

const FILTERS: LineFilter[] = ['all', 'pending', 'objected', 'voided'];

/** Lista filtrable en cliente de los cargos de un ciclo (solo vista comerciante cuando hay >4 líneas). */
export function CycleLinesList({
  lines,
  currency,
  customerId,
  cycleId,
  permissions,
  nowIso,
  portalStoreId,
}: {
  lines: CycleDetailLine[];
  currency: Currency;
  customerId: string;
  cycleId: string;
  permissions: { object: boolean; resolve: boolean };
  nowIso: string;
  portalStoreId?: string;
}) {
  const t = useTranslations('Collections.cycle');
  const [filter, setFilter] = useState<LineFilter>('all');
  const now = new Date(nowIso);
  const showFilter = !portalStoreId && lines.length > 4;

  const counts: Record<LineFilter, number> = {
    all: lines.length,
    pending: lines.filter(
      (l) => l.kind === 'purchase' && l.chargeStatus !== 'VOIDED' && l.consentStatus === 'PENDING',
    ).length,
    objected: lines.filter(
      (l) => l.kind === 'purchase' && l.chargeStatus !== 'VOIDED' && l.consentStatus === 'OBJECTED',
    ).length,
    voided: lines.filter(
      (l) => l.kind === 'void' || (l.kind === 'purchase' && l.chargeStatus === 'VOIDED'),
    ).length,
  };

  const visible =
    filter === 'all'
      ? lines
      : lines.filter((l) => {
          if (filter === 'pending') {
            return (
              l.kind === 'purchase' && l.chargeStatus !== 'VOIDED' && l.consentStatus === 'PENDING'
            );
          }
          if (filter === 'objected') {
            return (
              l.kind === 'purchase' && l.chargeStatus !== 'VOIDED' && l.consentStatus === 'OBJECTED'
            );
          }
          return l.kind === 'void' || (l.kind === 'purchase' && l.chargeStatus === 'VOIDED');
        });

  return (
    <div className="flex flex-col gap-3">
      {showFilter ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filterLabel')}>
          {FILTERS.map((key) => {
            if (key !== 'all' && counts[key] === 0) return null;
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(key)}
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-[transform,colors] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
                  active
                    ? 'bg-soft text-soft-ink'
                    : 'border border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                )}
              >
                <span>{t(`filter.${key}`)}</span>
                <span className="tabular-nums opacity-80">{counts[key]}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="py-2 text-sm text-ink-soft">{t('noMatchingLines')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {visible.map((line, index) => (
            <li key={`${line.kind}-${line.chargeId}-${index}`} className="py-3">
              <ChargeLine
                line={line}
                currency={currency}
                customerId={customerId}
                cycleId={cycleId}
                permissions={permissions}
                now={now}
                portalStoreId={portalStoreId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
