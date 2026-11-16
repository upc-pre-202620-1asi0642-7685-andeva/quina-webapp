import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import { getCycleDetail } from '@/infrastructure/db/queries/collections';
import { requirePortalUser } from '@/presentation/auth/guards';
import { CycleStatement } from '@/presentation/components/collections/cycle-statement';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';

/** US14.6 y 14.9: el estado de cuenta de un ciclo, con cada compra y sus productos. */
export default async function PortalCyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; cycleId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { storeId, cycleId } = await params;
  const { links } = await requirePortalUser(`/portal/${storeId}/cycles/${cycleId}`);
  if (!z.uuid().safeParse(storeId).success || !z.uuid().safeParse(cycleId).success) notFound();
  const link = links.find((l) => l.storeId === storeId);
  if (!link) notFound();
  // getCycleDetail filtra por el customerId del vínculo: un ciclo ajeno no existe
  const cycle = await getCycleDetail(storeId, link.customerId, cycleId);
  if (!cycle) notFound();

  const t = await getTranslations('Portal.cycle');
  const tCollections = await getTranslations('Collections');
  const { notice } = await searchParams;
  const now = new Date();
  const billed = cycle.status !== 'OPEN';
  const payable = cycle.status === 'BILLED' || cycle.status === 'OVERDUE';
  const remaining = MoneyValue.of(cycle.totalDue, cycle.currency).minus(
    MoneyValue.of(cycle.amountPaid, cycle.currency),
  );
  const showRemaining =
    payable &&
    MoneyValue.of(cycle.amountPaid, cycle.currency).isPositive() &&
    remaining.isPositive();

  return (
    <>
      <Link
        href={`/portal/${storeId}`}
        className="inline-flex min-h-11 items-center gap-2 self-start text-base font-medium text-link-active transition-transform duration-150 ease-(--ease-out-expo) hover:underline active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-5" />
        <span>{t('back')}</span>
      </Link>

      {notice === 'objected' ? (
        <Notice tone="success" className="text-base">
          <p>{t('objected')}</p>
        </Notice>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {tCollections('cycle.title', { date: formatDate(cycle.cutOffDate) })}
          </h1>
          <p className="text-base text-ink-soft">{t('subtitle', { number: cycle.cycleNumber })}</p>
          <CycleStatusBadge status={cycleBadgeStatus(cycle.status, cycle.paymentDueDate, now)} />
        </div>
        {payable ? (
          <Link
            href={`/portal/${storeId}#payment-info`}
            className={buttonVariants({
              variant: 'primary',
              size: 'lg',
              className: 'w-full sm:w-auto',
            })}
          >
            {t('payNow')}
          </Link>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1 rounded-field bg-paper-deep p-4">
          <dt className="text-base text-ink-soft">
            {showRemaining
              ? t('remaining')
              : billed
                ? tCollections('cycle.totalDue')
                : tCollections('cycle.openTotal')}
          </dt>
          <dd className="text-3xl font-bold tracking-tight text-ink">
            <Money
              amount={showRemaining ? remaining.toFixed2() : cycle.totalDue}
              currency={cycle.currency}
            />
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-4">
          <dt className="text-base text-ink-soft">{tCollections('cycle.dueDate')}</dt>
          <dd className="font-semibold text-ink tabular-nums">
            {formatDate(cycle.paymentDueDate)}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-4">
          <dt className="text-base text-ink-soft">{tCollections('cycle.paid')}</dt>
          <dd className="font-semibold text-ink">
            <Money amount={cycle.amountPaid} currency={cycle.currency} />
          </dd>
        </div>
      </dl>

      <CycleStatement
        cycle={cycle}
        customerId={link.customerId}
        // US14.9: el vecino observa; solo el dueño resuelve
        permissions={{ object: true, resolve: false }}
        now={now}
        paymentHref={(paymentId) => `/portal/${storeId}/payments/${paymentId}`}
        portalStoreId={storeId}
      />
    </>
  );
}
