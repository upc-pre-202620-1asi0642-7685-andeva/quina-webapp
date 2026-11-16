import { getTranslations } from 'next-intl/server';
import type { Currency } from '@/core/domain/shared/money';
import type { InstallmentPlan } from '@/infrastructure/db/queries/portal';
import { formatMoney, Money } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { InstallmentScheduleList } from './installment-schedule-list';

// DESIGN.md §2.4: los mismos colores de estado que los ciclos
const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-paper-deep text-ink-soft',
  PAID: 'bg-success/12 text-success-ink',
  OVERDUE: 'bg-error/12 text-error-ink',
};

function StatusBadge({
  status,
  label,
  compact = false,
}: {
  status: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 font-medium whitespace-nowrap',
        compact ? 'text-[13px]' : 'text-[15px]',
        STATUS_STYLES[status] ?? STATUS_STYLES.PENDING,
      )}
    >
      {label}
    </span>
  );
}

/** US14.7: tabla francesa de cada compra en cuotas, pagadas y por vencer. */
export async function InstallmentPlans({
  plans,
  currency,
  compact = false,
}: {
  plans: InstallmentPlan[];
  currency: Currency;
  compact?: boolean;
}) {
  const t = await getTranslations('Portal.installments');
  const statusLabel = (status: string) =>
    t(`statuses.${status === 'PAID' || status === 'OVERDUE' ? status : 'PENDING'}`);
  return (
    <section
      aria-labelledby="installments-title"
      className={cn(
        'flex flex-col gap-5 rounded-card border border-line bg-surface sm:p-6',
        compact ? 'p-4' : 'p-5',
      )}
    >
      <h2
        id="installments-title"
        className={cn('font-semibold text-ink', compact ? 'text-lg' : 'text-xl')}
      >
        {t('title')}
      </h2>
      {plans.map((plan) => {
        const paid = plan.rows.filter((row) => row.status === 'PAID').length;
        const total = plan.rows.length;
        const percent = total > 0 ? Math.round((paid / total) * 100) : 0;
        const nextRow = plan.rows.find(
          (row) => row.status === 'OVERDUE' || row.status === 'PENDING',
        );
        return (
          <div key={plan.chargeId} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-ink">
                  {t('purchase', {
                    date: formatDate(plan.purchaseDate),
                    amount: formatMoney(plan.principal, currency),
                  })}
                </h3>
                <span
                  className={cn(
                    'font-medium text-ink-soft tabular-nums',
                    compact ? 'text-sm' : 'text-base',
                  )}
                >
                  {t('progress', { paid, total })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={paid}
                aria-label={t('progress', { paid, total })}
                className="h-2 overflow-hidden rounded-full bg-paper-deep"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-250 ease-(--ease-out-expo)"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {nextRow ? (
                <p className={cn('text-ink-soft', compact ? 'text-sm' : 'text-base')}>
                  {t('nextDue', {
                    number: nextRow.number,
                    date: formatDate(nextRow.dueDate),
                    amount: formatMoney(nextRow.installment, currency),
                  })}
                </p>
              ) : null}
            </div>

            <InstallmentScheduleList rows={plan.rows} currency={currency} compact={compact} />

            <div className="hidden rounded-field border border-line sm:block">
              <table className={cn('w-full', compact ? 'text-sm' : 'text-base')}>
                <caption className="sr-only">{t('caption')}</caption>
                <thead
                  className={cn(
                    'bg-paper-deep text-left text-ink-soft',
                    compact ? 'text-[13px]' : 'text-[15px]',
                  )}
                >
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t('number')}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t('dueDate')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('installment')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('principal')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('interest')}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t('status')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.rows.map((row) => (
                    <tr key={row.number}>
                      <td className="px-3 py-2 tabular-nums">
                        {row.number}/{row.total}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.dueDate)}</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        <Money amount={row.installment} currency={currency} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Money amount={row.principal} currency={currency} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Money amount={row.interest} currency={currency} />
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          status={row.status}
                          label={statusLabel(row.status)}
                          compact={compact}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
