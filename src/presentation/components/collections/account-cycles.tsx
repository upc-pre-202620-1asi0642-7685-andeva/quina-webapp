import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, ReceiptTextIcon } from 'lucide-react';
import type { Currency } from '@/core/domain/shared/money';
import type { CycleSummary } from '@/infrastructure/db/queries/collections';
import { Money } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { CycleStatusBadge, cycleBadgeStatus } from './cycle-status-badge';

/** Ciclos del vecino en su ficha (US10) o en su portal (US14): cada uno abre su estado de cuenta. */
export async function AccountCycles({
  hrefBase,
  cycles,
  currency,
  now,
  large = false,
}: {
  /** `/customers/<id>` en el panel o `/portal/<storeId>` en el portal. */
  hrefBase: string;
  cycles: CycleSummary[];
  currency: Currency;
  now: Date;
  /** Portal del vecino: un escalón más de letra (DESIGN.md §6.2). */
  large?: boolean;
}) {
  const t = await getTranslations('Collections.account');
  return (
    <section
      aria-labelledby="cycles-title"
      className={cn(
        'flex flex-col gap-4 rounded-card border border-line bg-surface sm:p-6',
        large ? 'p-5' : 'p-4',
      )}
    >
      <h2 id="cycles-title" className={cn('font-semibold text-ink', large ? 'text-xl' : 'text-lg')}>
        {t('title')}
      </h2>
      {cycles.length === 0 ? (
        <div className="flex items-center gap-3 rounded-field bg-paper-deep p-4 text-sm text-ink-soft">
          <ReceiptTextIcon aria-hidden="true" className="size-5 shrink-0" />
          <p>{t('empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {cycles.map((cycle) => (
            <li key={cycle.id}>
              <Link
                href={`${hrefBase}/cycles/${cycle.id}`}
                className="flex min-h-14 items-center gap-3 py-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring sm:px-2"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium text-ink">
                    {t('cutOff', { date: formatDate(cycle.cutOffDate) })}
                  </span>
                  <span className={cn('text-ink-soft', large ? 'text-base' : 'text-[13px]')}>
                    {cycle.status === 'OPEN'
                      ? t('openHint')
                      : t('dueOn', { date: formatDate(cycle.paymentDueDate) })}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Money
                    amount={cycle.amount}
                    currency={currency}
                    className="font-semibold whitespace-nowrap text-ink"
                  />
                  <CycleStatusBadge
                    status={cycleBadgeStatus(cycle.status, cycle.paymentDueDate, now)}
                  />
                </div>
                <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
