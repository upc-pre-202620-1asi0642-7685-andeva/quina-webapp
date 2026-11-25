'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BanIcon, CheckIcon, ChevronRightIcon, MessageSquareWarningIcon } from 'lucide-react';
import type { ObjectedChargeRow } from '@/infrastructure/db/queries/collections';
import { Money } from '@/presentation/components/money';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { ChargeActionSheet, type ChargeActionKind } from './charge-action-sheet';

type ActiveResolve = {
  action: Exclude<ChargeActionKind, 'object'>;
  row: ObjectedChargeRow;
};

/** Cola de cargos observados (US11): el dueño confirma o anula desde Cobranza o Cobrar. */
export function ObjectionsQueue({
  items,
  canResolve,
  showCustomer = true,
}: {
  items: ObjectedChargeRow[];
  canResolve: boolean;
  showCustomer?: boolean;
}) {
  const t = useTranslations('Collections');
  const [active, setActive] = useState<ActiveResolve | null>(null);

  return (
    <>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {items.map((row) => (
          <li key={row.chargeId} className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {showCustomer ? (
                    <Link
                      href={`/customers/${row.customerId}`}
                      className="font-semibold text-ink hover:underline"
                    >
                      {row.customerName}
                    </Link>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2.5 py-0.5 text-[13px] font-medium text-amber-ink">
                    <MessageSquareWarningIcon aria-hidden="true" className="size-3.5" />
                    {t('charge.consent.OBJECTED')}
                  </span>
                </div>
                <p className="text-sm text-ink-soft">
                  {t('charge.purchase', { date: formatDate(row.purchaseDate) })} ·{' '}
                  {t('objections.cycleLabel', {
                    number: row.cycleNumber,
                    date: formatDate(row.cutOffDate),
                  })}
                </p>
                {row.items.length > 0 ? (
                  <p className="text-[13px] text-ink-soft">
                    {row.items.map((i) => `${i.quantity} × ${i.name}`).join(' · ')}
                  </p>
                ) : null}
              </div>
              <Money
                amount={row.principalAmount}
                currency={row.currency}
                className="text-base font-semibold whitespace-nowrap text-ink"
              />
            </div>

            {row.objectionNote ? (
              <p className="rounded-field bg-paper-deep px-3 py-2 text-sm text-ink">
                {t('charge.objectionNote', { note: row.objectionNote })}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/customers/${row.customerId}/cycles/${row.cycleId}`}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                {t('objections.viewCycle')}
                <ChevronRightIcon aria-hidden="true" className="size-4" />
              </Link>

              {canResolve ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActive({ action: 'confirm', row })}
                  >
                    <CheckIcon aria-hidden="true" />
                    {t('charge.confirm')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setActive({ action: 'void', row })}
                  >
                    <BanIcon aria-hidden="true" />
                    {t('charge.void')}
                  </Button>
                </div>
              ) : (
                <span className="text-[13px] text-ink-soft">{t('charge.askOwner')}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {active ? (
        <ChargeActionSheet
          action={active.action}
          onClose={() => setActive(null)}
          chargeId={active.row.chargeId}
          customerId={active.row.customerId}
          cycleId={active.row.cycleId}
          redirectToCycleNotice={false}
          context={{
            date: active.row.purchaseDate,
            amount: active.row.principalAmount,
            currency: active.row.currency,
            items: active.row.items,
            objectionNote: active.row.objectionNote,
          }}
        />
      ) : null}
    </>
  );
}
