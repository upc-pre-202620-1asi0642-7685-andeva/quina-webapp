import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { listCollections, listTodayNotices } from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { ManualNotices } from '@/presentation/components/collections/manual-notices';
import { Money } from '@/presentation/components/money';
import { formatDate } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

const TABS = ['due', 'overdue', 'notices'] as const;
type Tab = (typeof TABS)[number];

const TIME = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Lima',
});

/** Cobranza (US12 y US13): por cobrar, vencidos y los avisos que salieron hoy. */
export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireStoreUser('/collections', 'payments.create');
  const t = await getTranslations('Collections.page');
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.find((x) => x === raw) ?? 'due';
  const now = new Date();

  const [rows, notices, store] = await Promise.all([
    listCollections(user.storeId),
    listTodayNotices(user.storeId, now),
    loadStoreContext(user.storeId),
  ]);
  const due = rows.filter((r) => r.status === 'BILLED');
  const overdue = rows.filter((r) => r.status === 'OVERDUE');
  const manual =
    !PlanLimits.of(store.tier).features.automaticNotifications &&
    can(user.role, 'notifications.send');
  const counts: Record<Tab, number> = {
    due: due.length,
    overdue: overdue.length,
    notices: notices.length,
  };
  const shown = tab === 'due' ? due : overdue;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">
          {manual ? t('subtitleManual') : t('subtitleAutomatic')}
        </p>
      </header>

      {manual ? <ManualNotices /> : null}

      <nav aria-label={t('tabsLabel')} className="flex gap-1 rounded-field bg-paper-deep p-1">
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === 'due' ? '/collections' : `/collections?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-field px-2 text-sm font-medium',
              tab === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
            )}
          >
            {t(`tabs.${key}`)}
            <span className="text-ink-soft tabular-nums">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      {tab === 'notices' ? (
        notices.length === 0 ? (
          <p className="rounded-field bg-paper-deep p-4 text-sm text-ink-soft">{t('noNotices')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {notices.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium text-ink">{t(`noticeType.${n.type}`)}</span>
                  <span className="truncate text-ink-soft">
                    {n.name ?? n.recipientEmail} · {TIME.format(n.at)}
                  </span>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-medium',
                    n.status === 'BOUNCED' || n.status === 'FAILED'
                      ? 'bg-error/12 text-error-ink'
                      : n.status === 'QUEUED'
                        ? 'bg-paper-deep text-ink-soft'
                        : 'bg-success/12 text-success-ink',
                  )}
                >
                  {t(`noticeStatus.${n.status}`)}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <p className="rounded-field bg-paper-deep p-4 text-sm text-ink-soft">
          {tab === 'due' ? t('noDue') : t('noOverdue')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
          {shown.map((r) => (
            <li key={r.cycleId}>
              <Link
                href={`/customers/${r.customerId}/pay`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-ink">{r.name}</span>
                  <span className="text-[13px] text-ink-soft">
                    {t('dueOn', { date: formatDate(r.paymentDueDate) })}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Money
                    amount={r.totalDue}
                    currency={r.currency}
                    className="font-semibold whitespace-nowrap text-ink"
                  />
                  <CycleStatusBadge status={cycleBadgeStatus(r.status, r.paymentDueDate, now)} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
