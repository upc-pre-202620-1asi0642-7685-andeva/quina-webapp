import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { can } from '@/core/domain/identity/permissions';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { getCycleDetail } from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import { CyclePayButton } from '@/presentation/components/collections/cycle-pay-button';
import { CycleStatement } from '@/presentation/components/collections/cycle-statement';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { FlashToast } from '@/presentation/components/feedback/flash-toast';
import { Money } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import { loadStoreContext } from '@/presentation/queries/store-context';

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

  const [cycle, store, t] = await Promise.all([
    getCycleDetail(user.storeId, id, cycleId),
    loadStoreContext(user.storeId),
    getTranslations('Collections'),
  ]);
  if (!cycle) notFound();

  const { notice } = await searchParams;
  const shownNotice = NOTICES.find((n) => n === notice);
  const currency = cycle.currency;
  const billed = cycle.status !== 'OPEN';
  const permissions = {
    object: can(user.role, 'charges.object') && !store.isReadOnly,
    resolve: can(user.role, 'charges.resolve') && !store.isReadOnly,
  };
  const payable = (cycle.status === 'BILLED' || cycle.status === 'OVERDUE') && !store.isReadOnly;
  const now = new Date();
  const remaining = MoneyValue.of(cycle.totalDue, currency).minus(
    MoneyValue.of(cycle.amountPaid, currency),
  );
  const showPay = payable && can(user.role, 'payments.create');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={`/customers/${id}`}
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('cycle.back', { name: cycle.customer.firstName })}
      </Link>

      {shownNotice ? <FlashToast type="success" title={t(`cycle.notice.${shownNotice}`)} /> : null}

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
        {showPay ? <CyclePayButton customerId={id} /> : null}
      </header>

      <dl className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-3">
        <div className="col-span-2 flex flex-col gap-1 p-4 sm:col-span-1">
          <dt className="text-[13px] text-ink-soft">
            {billed
              ? remaining.isPositive() && cycle.amountPaid !== '0.00'
                ? t('cycle.remaining')
                : t('cycle.totalDue')
              : t('cycle.openTotal')}
          </dt>
          <dd className="text-lg font-semibold whitespace-nowrap text-ink">
            <Money
              amount={
                billed && remaining.isPositive() && cycle.amountPaid !== '0.00'
                  ? remaining.toFixed2()
                  : cycle.totalDue
              }
              currency={currency}
            />
          </dd>
        </div>
        <div className="flex flex-col gap-1 border-t border-line p-4 sm:border-t-0">
          <dt className="text-[13px] text-ink-soft">{t('cycle.dueDate')}</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatDate(cycle.paymentDueDate)}
          </dd>
        </div>
        <div className="flex flex-col gap-1 border-t border-line p-4 sm:border-t-0">
          <dt className="text-[13px] text-ink-soft">{t('cycle.paid')}</dt>
          <dd className="text-lg font-semibold whitespace-nowrap text-ink">
            <Money amount={cycle.amountPaid} currency={currency} />
          </dd>
        </div>
      </dl>

      <CycleStatement
        cycle={cycle}
        customerId={id}
        permissions={permissions}
        now={now}
        paymentHref={(paymentId) => `/payments/${paymentId}`}
      />
    </div>
  );
}
