import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { can } from '@/core/domain/identity/permissions';
import { getCycleDetail } from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import { CycleStatement } from '@/presentation/components/collections/cycle-statement';
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
