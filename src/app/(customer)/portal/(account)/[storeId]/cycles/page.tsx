import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { listCycles } from '@/infrastructure/db/queries/collections';
import { getInstallmentPlans, getPortalAccount } from '@/infrastructure/db/queries/portal';
import { requirePortalUser } from '@/presentation/auth/guards';
import { AccountCycles } from '@/presentation/components/collections/account-cycles';
import { Notice } from '@/presentation/components/notice';
import { InstallmentPlans } from '@/presentation/components/portal/installment-plans';
import { cn } from '@/presentation/lib/utils';

type CycleFilter = 'all' | 'payable' | 'paid';

const FILTERS: CycleFilter[] = ['all', 'payable', 'paid'];

/** Historial completo de ciclos y cuotas del vecino en una tienda. */
export default async function PortalCyclesPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { storeId } = await params;
  const { filter: rawFilter } = await searchParams;
  const { links } = await requirePortalUser(`/portal/${storeId}/cycles`);
  if (!z.uuid().safeParse(storeId).success) notFound();
  const link = links.find((l) => l.storeId === storeId);
  if (!link) notFound();

  const now = new Date();
  const portal = await getPortalAccount(link, now);
  if (!portal) notFound();

  const t = await getTranslations('Portal.cycles');
  const tAccount = await getTranslations('Portal.account');
  const filter: CycleFilter = rawFilter === 'payable' || rawFilter === 'paid' ? rawFilter : 'all';

  const account = portal.account;
  const [cycles, plans] = await Promise.all([
    account ? listCycles(storeId, account.id) : Promise.resolve([]),
    account ? getInstallmentPlans(storeId, account.id) : Promise.resolve([]),
  ]);

  const counts: Record<CycleFilter, number> = {
    all: cycles.length,
    payable: cycles.filter((c) => c.status === 'BILLED' || c.status === 'OVERDUE').length,
    paid: cycles.filter((c) => c.status === 'PAID').length,
  };

  const shownCycles =
    filter === 'all'
      ? cycles
      : cycles.filter((c) =>
          filter === 'payable'
            ? c.status === 'BILLED' || c.status === 'OVERDUE'
            : c.status === 'PAID',
        );

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-base text-ink-soft">{portal.storeName}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-base text-ink-soft">{t('subtitle')}</p>
      </header>

      {!account ? (
        <Notice tone="info" className="text-base">
          <p>{tAccount('noCredit')}</p>
        </Notice>
      ) : (
        <>
          {cycles.length > 0 ? (
            <nav aria-label={t('filterLabel')} className="flex flex-wrap items-center gap-2">
              {FILTERS.map((key) => {
                const active = filter === key;
                return (
                  <Link
                    key={key}
                    href={
                      key === 'all'
                        ? `/portal/${storeId}/cycles`
                        : `/portal/${storeId}/cycles?filter=${key}`
                    }
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-base font-medium transition-[transform,color,background-color,border-color] duration-150 ease-(--ease-out-expo) focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.97]',
                      active
                        ? 'border-link-active bg-soft text-soft-ink'
                        : 'border-line bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                    )}
                  >
                    <span>{t(`filters.${key}`)}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-sm tabular-nums',
                        active ? 'bg-surface/80 text-soft-ink' : 'bg-paper-deep text-ink-soft',
                      )}
                    >
                      {counts[key]}
                    </span>
                  </Link>
                );
              })}
            </nav>
          ) : null}

          <AccountCycles
            hrefBase={`/portal/${storeId}`}
            cycles={shownCycles}
            currency={account.currency}
            now={now}
            large
          />

          {plans.length > 0 ? <InstallmentPlans plans={plans} currency={account.currency} /> : null}
        </>
      )}
    </>
  );
}
