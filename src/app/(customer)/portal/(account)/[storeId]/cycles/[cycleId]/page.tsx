import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getCycleDetail } from '@/infrastructure/db/queries/collections';
import { requirePortalUser } from '@/presentation/auth/guards';
import { CycleStatement } from '@/presentation/components/collections/cycle-statement';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
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

  return (
    <>
      <Link
        href={`/portal/${storeId}`}
        className="inline-flex min-h-11 items-center gap-2 self-start text-base font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-5" />
        {t('back')}
      </Link>

      {notice === 'objected' ? (
        <Notice tone="success">
          <p>{t('objected')}</p>
        </Notice>
      ) : null}

      <header className="flex flex-col items-start gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          {tCollections('cycle.title', { date: formatDate(cycle.cutOffDate) })}
        </h1>
        <CycleStatusBadge status={cycleBadgeStatus(cycle.status, cycle.paymentDueDate, now)} />
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1 rounded-field bg-paper-deep p-4">
          <dt className="text-base text-ink-soft">
            {billed ? tCollections('cycle.totalDue') : tCollections('cycle.openTotal')}
          </dt>
          <dd className="text-3xl font-semibold text-ink">
            <Money amount={cycle.totalDue} currency={cycle.currency} />
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-4">
          <dt className="text-base text-ink-soft">{tCollections('cycle.dueDate')}</dt>
          <dd className="font-semibold text-ink">{formatDate(cycle.paymentDueDate)}</dd>
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
