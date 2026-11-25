import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, ReceiptTextIcon } from 'lucide-react';
import type { CycleDetail } from '@/infrastructure/db/queries/collections';
import { ChargeLine } from '@/presentation/components/collections/charge-line';
import { CycleLinesList } from '@/presentation/components/collections/cycle-lines-list';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';

/**
 * Detalle de un estado de cuenta (US10 crit. 4): compras, totales, compras en
 * cuotas y pagos. Lo usan la ficha del dueño y el portal del vecino (US14.6).
 */
export async function CycleStatement({
  cycle,
  customerId,
  permissions,
  now,
  paymentHref,
  portalStoreId,
}: {
  cycle: CycleDetail;
  customerId: string;
  permissions: { object: boolean; resolve: boolean };
  now: Date;
  paymentHref: (paymentId: string) => string;
  portalStoreId?: string;
}) {
  const t = await getTranslations('Collections');
  const currency = cycle.currency;
  const billed = cycle.status !== 'OPEN';
  // DESIGN.md §6.2: el portal usa un escalón más de letra
  const large = Boolean(portalStoreId);
  const body = large ? 'text-lg' : 'text-sm';

  return (
    <>
      {!billed ? (
        <Notice tone="info" className={large ? 'text-base' : 'text-sm'}>
          <p>{t('cycle.openNotice', { date: formatDate(cycle.cutOffDate) })}</p>
        </Notice>
      ) : null}

      <section
        aria-labelledby="lines-title"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <h2
          id="lines-title"
          className={cn('font-semibold text-ink', large ? 'text-xl' : 'text-lg')}
        >
          {t('cycle.linesTitle')}
        </h2>
        {cycle.lines.length === 0 ? (
          <p className={cn('text-ink-soft', body)}>{t('cycle.noLines')}</p>
        ) : (
          <CycleLinesList
            lines={cycle.lines}
            currency={currency}
            customerId={customerId}
            cycleId={cycle.id}
            permissions={permissions}
            nowIso={now.toISOString()}
            portalStoreId={portalStoreId}
          />
        )}

        <dl className={cn('flex flex-col gap-2 border-t border-line pt-4', body)}>
          <Total label={t('cycle.purchases')} amount={cycle.purchasesTotal} currency={currency} />
          {billed ? (
            <Total
              label={t('cycle.interest')}
              amount={cycle.compensatoryInterestTotal}
              currency={currency}
            />
          ) : null}
          {cycle.installmentsTotal !== '0.00' || !large ? (
            <Total
              label={t('cycle.installments')}
              amount={cycle.installmentsTotal}
              currency={currency}
            />
          ) : null}
          {cycle.adjustmentsTotal !== '0.00' ? (
            <Total
              label={t('cycle.adjustments')}
              amount={cycle.adjustmentsTotal}
              currency={currency}
              negative
            />
          ) : null}
          {cycle.moratoryInterestTotal !== '0.00' ? (
            <Total
              label={t('cycle.moratory')}
              amount={cycle.moratoryInterestTotal}
              currency={currency}
            />
          ) : null}
          <div
            className={cn(
              'flex items-center justify-between gap-3 pt-2 font-semibold text-ink',
              large ? 'text-xl' : 'text-base',
            )}
          >
            <dt>{billed ? t('cycle.totalDue') : t('cycle.openTotal')}</dt>
            <dd>
              <Money amount={cycle.totalDue} currency={currency} />
            </dd>
          </div>
        </dl>
      </section>

      {cycle.installmentPurchases.length > 0 ? (
        <section
          aria-labelledby="installment-purchases-title"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="installment-purchases-title"
              className={cn('font-semibold text-ink', large ? 'text-xl' : 'text-lg')}
            >
              {t('cycle.installmentPurchasesTitle')}
            </h2>
            <p className={cn('text-ink-soft', large ? 'text-base' : 'text-sm')}>
              {t('cycle.installmentPurchasesHint')}
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {cycle.installmentPurchases.map((purchase) => (
              <li key={purchase.chargeId} className="py-3">
                <ChargeLine
                  line={{
                    kind: 'purchase',
                    chargeId: purchase.chargeId,
                    date: purchase.date,
                    items: purchase.items,
                    principal: purchase.principal,
                    days: null,
                    interest: null,
                    amount: purchase.principal,
                    chargeStatus: purchase.chargeStatus,
                    consentStatus: purchase.consentStatus,
                    consentDeadline: purchase.consentDeadline,
                    objectionNote: purchase.objectionNote,
                    resolutionNote: null,
                    voidReason: purchase.voidReason,
                  }}
                  installments={purchase.installments}
                  currency={currency}
                  customerId={customerId}
                  cycleId={cycle.id}
                  permissions={permissions}
                  now={now}
                  portalStoreId={portalStoreId}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {cycle.payments.length > 0 ? (
        <section
          aria-labelledby="payments-title"
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6"
        >
          <h2
            id="payments-title"
            className={cn('font-semibold text-ink', large ? 'text-xl' : 'text-lg')}
          >
            {t('cycle.paymentsTitle')}
          </h2>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-field border border-line bg-paper/40">
            {cycle.payments.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={paymentHref(payment.id)}
                  className={cn(
                    'flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-surface-hover',
                    large ? 'text-lg' : 'text-sm',
                  )}
                >
                  <ReceiptTextIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1 font-medium text-ink">
                    {t('cycle.receipt', {
                      number: payment.receiptNumber,
                      date: formatDate(payment.paymentDate),
                    })}
                  </span>
                  <Money
                    amount={payment.amountPaid}
                    currency={currency}
                    className="font-semibold whitespace-nowrap text-ink"
                  />
                  <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Total({
  label,
  amount,
  currency,
  negative = false,
}: {
  label: string;
  amount: string;
  currency: 'PEN' | 'USD';
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-ink-soft">
      <dt>{label}</dt>
      <dd className="text-ink">
        {negative ? '− ' : ''}
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}
