import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { can } from '@/core/domain/identity/permissions';
import { getCycleDetail } from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import { ChargeLine } from '@/presentation/components/collections/charge-line';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { CyclePayButton } from '@/presentation/components/collections/cycle-pay-button';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { formatDate } from '@/presentation/lib/format-date';

const NOTICES = ['objected', 'confirmed', 'voided'] as const;

export default async function CyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; cycleId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id, cycleId } = await params;
  const user = await requireStoreUser(`/customers/${id}/cycles/${cycleId}`, 'customers.read');
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(cycleId).success) notFound();
  const cycle = await getCycleDetail(user.storeId, id, cycleId);
  if (!cycle) notFound();

  const t = await getTranslations('Collections');
  const { notice } = await searchParams;
  const shownNotice = NOTICES.find((n) => n === notice);
  const currency = cycle.currency;
  const billed = cycle.status !== 'OPEN';
  const permissions = {
    object: can(user.role, 'charges.object'),
    resolve: can(user.role, 'charges.resolve'),
  };
  const payable = cycle.status === 'BILLED' || cycle.status === 'OVERDUE';
  const now = new Date();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={`/customers/${id}`}
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('cycle.back', { name: cycle.customer.firstName })}
      </Link>

      {shownNotice ? (
        <Notice tone="success">
          <p>{t(`cycle.notice.${shownNotice}`)}</p>
        </Notice>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t('cycle.title', { date: formatDate(cycle.cutOffDate) })}
          </h1>
          <p className="text-sm text-ink-soft">
            {t('cycle.subtitle', {
              name: `${cycle.customer.firstName} ${cycle.customer.lastName}`,
              number: cycle.cycleNumber,
            })}
          </p>
          <CycleStatusBadge status={cycleBadgeStatus(cycle.status, cycle.paymentDueDate, now)} />
        </div>
        {payable && can(user.role, 'payments.create') ? <CyclePayButton customerId={id} /> : null}
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 flex flex-col gap-1 rounded-field bg-paper-deep p-3 sm:col-span-1">
          <dt className="text-[13px] text-ink-soft">
            {billed ? t('cycle.totalDue') : t('cycle.openTotal')}
          </dt>
          <dd className="text-lg font-semibold whitespace-nowrap text-ink">
            <Money amount={cycle.totalDue} currency={currency} />
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-3">
          <dt className="text-[13px] text-ink-soft">{t('cycle.dueDate')}</dt>
          <dd className="text-lg font-semibold text-ink">{formatDate(cycle.paymentDueDate)}</dd>
        </div>
        <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-3">
          <dt className="text-[13px] text-ink-soft">{t('cycle.paid')}</dt>
          <dd className="text-lg font-semibold whitespace-nowrap text-ink">
            <Money amount={cycle.amountPaid} currency={currency} />
          </dd>
        </div>
      </dl>

      {!billed ? (
        <p className="rounded-field bg-paper-deep p-3 text-sm text-ink-soft">
          {t('cycle.openNotice', { date: formatDate(cycle.cutOffDate) })}
        </p>
      ) : null}

      <section
        aria-labelledby="lines-title"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
      >
        <h2 id="lines-title" className="text-lg font-semibold text-ink">
          {t('cycle.linesTitle')}
        </h2>
        {cycle.lines.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('cycle.noLines')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {cycle.lines.map((line, index) => (
              <li key={`${line.kind}-${line.chargeId}-${index}`} className="py-3">
                <ChargeLine
                  line={line}
                  currency={currency}
                  customerId={id}
                  cycleId={cycle.id}
                  permissions={permissions}
                  now={now}
                />
              </li>
            ))}
          </ul>
        )}

        <dl className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <Total label={t('cycle.purchases')} amount={cycle.purchasesTotal} currency={currency} />
          {billed ? (
            <Total
              label={t('cycle.interest')}
              amount={cycle.compensatoryInterestTotal}
              currency={currency}
            />
          ) : null}
          <Total
            label={t('cycle.installments')}
            amount={cycle.installmentsTotal}
            currency={currency}
          />
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
          <div className="flex items-center justify-between gap-3 pt-2 text-base font-semibold text-ink">
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
            <h2 id="installment-purchases-title" className="text-lg font-semibold text-ink">
              {t('cycle.installmentPurchasesTitle')}
            </h2>
            <p className="text-sm text-ink-soft">{t('cycle.installmentPurchasesHint')}</p>
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
                  customerId={id}
                  cycleId={cycle.id}
                  permissions={permissions}
                  now={now}
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
          <h2 id="payments-title" className="text-lg font-semibold text-ink">
            {t('cycle.paymentsTitle')}
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {cycle.payments.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={`/payments/${payment.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm hover:bg-surface-hover"
                >
                  <span className="font-medium text-ink">
                    {t('cycle.receipt', {
                      number: payment.receiptNumber,
                      date: formatDate(payment.paymentDate),
                    })}
                  </span>
                  <Money
                    amount={payment.amountPaid}
                    currency={currency}
                    className="font-semibold"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
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
