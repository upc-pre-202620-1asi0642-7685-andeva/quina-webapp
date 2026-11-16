import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  AlertTriangleIcon,
  BanknoteIcon,
  ChartPieIcon,
  ChevronRightIcon,
  MailWarningIcon,
  MessageCircleIcon,
  MessageSquareWarningIcon,
  ReceiptTextIcon,
} from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { can } from '@/core/domain/identity/permissions';
import { Money as MoneyValue } from '@/core/domain/shared/money';
import {
  getManualNoticePreview,
  listCollections,
  listObjectedCharges,
  listRecentPayments,
  listTodayNotices,
} from '@/infrastructure/db/queries/collections';
import { requireStoreUser } from '@/presentation/auth/guards';
import { CollectionsControls } from '@/presentation/components/collections/collections-controls';
import {
  CycleStatusBadge,
  cycleBadgeStatus,
} from '@/presentation/components/collections/cycle-status-badge';
import { ManualNotices } from '@/presentation/components/collections/manual-notices';
import { ObjectionsQueue } from '@/presentation/components/collections/objections-queue';
import { Money, formatMoney } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table';
import {
  COLLECTIONS_TABS,
  collectionDaysDelta,
  collectionsHref,
  filterAndSortCollections,
  filterObjectedCharges,
  filterRecentPayments,
  filterTodayNotices,
  parseCollectionsQuery,
  summarizeCollections,
  whatsappWithMessageHref,
  type CollectionsTab,
  type CurrencyTotals,
} from '@/presentation/lib/collections-list';
import { formatDate, formatTime } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

function DualCurrencyMoney({ totals }: { totals: CurrencyTotals }) {
  const hasPen = MoneyValue.of(totals.pen, 'PEN').isPositive();
  const hasUsd = MoneyValue.of(totals.usd, 'USD').isPositive();
  if (!hasPen && !hasUsd) return <Money amount="0.00" currency="PEN" />;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      {hasPen ? <Money amount={totals.pen} currency="PEN" /> : null}
      {hasUsd ? <Money amount={totals.usd} currency="USD" /> : null}
    </span>
  );
}

/** Cobranza (US11, US12, US13): centro operativo con filtros, observaciones, recibos y avisos. */
export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    filter?: string;
    sort?: string;
    method?: string;
  }>;
}) {
  const user = await requireStoreUser('/collections', 'payments.create');
  const t = await getTranslations('Collections');
  const tPage = await getTranslations('Collections.page');
  const tPay = await getTranslations('Collections.pay');
  const query = parseCollectionsQuery(await searchParams);
  const now = new Date();

  const store = await loadStoreContext(user.storeId);
  const manual =
    !PlanLimits.of(store.tier).features.automaticNotifications &&
    can(user.role, 'notifications.send');

  const [rows, objected, payments, notices, manualPreview] = await Promise.all([
    listCollections(user.storeId),
    listObjectedCharges(user.storeId),
    listRecentPayments(user.storeId),
    listTodayNotices(user.storeId, now),
    manual ? getManualNoticePreview(user.storeId, now) : Promise.resolve(undefined),
  ]);

  const canResolve = can(user.role, 'charges.resolve') && !store.isReadOnly;
  const canPortfolio = can(user.role, 'reports.view');
  const canEditCustomer = can(user.role, 'customers.update') && !store.isReadOnly;

  const summary = summarizeCollections(rows, payments, now);
  const dueRows = rows.filter((r) => r.status === 'BILLED');
  const overdueRows = rows.filter((r) => r.status === 'OVERDUE');

  const activeCycleSource = query.tab === 'overdue' ? overdueRows : dueRows;
  const shownCycles = filterAndSortCollections(activeCycleSource, query, now);
  const shownObjections = filterObjectedCharges(objected, query.q);
  const shownPayments = filterRecentPayments(payments, query);
  const shownNotices = filterTodayNotices(notices, query.q);

  const counts: Record<CollectionsTab, number> = {
    due: dueRows.length,
    overdue: overdueRows.length,
    objections: objected.length,
    payments: payments.length,
    notices: notices.length,
  };

  const tabCounts = {
    dueSoon:
      query.tab === 'due'
        ? dueRows.filter((r) => {
            const d = collectionDaysDelta(r.paymentDueDate, now);
            return d >= 0 && d <= 3;
          }).length
        : 0,
    blocked: activeCycleSource.filter((r) => r.objectedCount > 0).length,
    bounced: activeCycleSource.filter((r) => r.emailBouncedAt !== null).length,
  };

  const hasObjections = objected.length > 0;
  const hasOverdue = summary.overdueCount > 0;

  function dueDeltaLabel(paymentDueDate: Date): {
    text: string;
    tone: 'error' | 'amber' | 'neutral';
  } {
    const days = collectionDaysDelta(paymentDueDate, now);
    if (days < 0) {
      return { text: tPage('daysLate', { count: Math.abs(days) }), tone: 'error' };
    }
    if (days === 0) {
      return { text: tPage('dueToday'), tone: 'amber' };
    }
    if (days <= 3) {
      return { text: tPage('dueInDays', { count: days }), tone: 'amber' };
    }
    return { text: tPage('dueOn', { date: formatDate(paymentDueDate) }), tone: 'neutral' };
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{tPage('title')}</h1>
          <p className="text-sm text-ink-soft">
            {manual ? tPage('subtitleManual') : tPage('subtitleAutomatic')}
          </p>
        </div>
        {canPortfolio ? (
          <Link href="/portfolio" className={buttonVariants({ variant: 'secondary' })}>
            <ChartPieIcon aria-hidden="true" />
            {tPage('viewPortfolio')}
          </Link>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
          <span className="text-[13px] text-ink-soft">{tPage('kpi.collectable')}</span>
          <span className="text-xl font-semibold text-ink">
            <DualCurrencyMoney totals={summary.totalCollectable} />
          </span>
          <span className="text-[13px] text-ink-soft tabular-nums">
            {tPage('kpi.cyclesCount', { count: rows.length })}
          </span>
        </div>

        <Link
          href={collectionsHref(query, { tab: 'overdue', filter: 'all' })}
          className={cn(
            'flex flex-col gap-1 rounded-card border p-4 transition-[transform,colors] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.98]',
            hasOverdue
              ? 'border-error/25 bg-error/12 text-error-ink'
              : 'border-line bg-surface text-ink',
          )}
        >
          <span className={cn('text-[13px]', hasOverdue ? 'text-error-ink' : 'text-ink-soft')}>
            {tPage('kpi.overdue')}
          </span>
          <span className="text-xl font-semibold">
            <DualCurrencyMoney totals={summary.totalOverdue} />
          </span>
          <span
            className={cn(
              'text-[13px] tabular-nums',
              hasOverdue ? 'text-error-ink' : 'text-ink-soft',
            )}
          >
            {tPage('kpi.cyclesCount', { count: summary.overdueCount })}
          </span>
        </Link>

        <Link
          href={collectionsHref(query, { tab: 'due', filter: 'dueSoon' })}
          className={cn(
            'flex flex-col gap-1 rounded-card border p-4 transition-[transform,colors] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.98]',
            summary.dueSoonCount > 0
              ? 'border-amber/30 bg-amber/12 text-amber-ink'
              : 'border-line bg-surface text-ink',
          )}
        >
          <span
            className={cn(
              'text-[13px]',
              summary.dueSoonCount > 0 ? 'text-amber-ink' : 'text-ink-soft',
            )}
          >
            {tPage('kpi.dueSoon')}
          </span>
          <span className="text-xl font-semibold tabular-nums">{summary.dueSoonCount}</span>
          <span
            className={cn(
              'text-[13px]',
              summary.dueSoonCount > 0 ? 'text-amber-ink' : 'text-ink-soft',
            )}
          >
            {tPage('kpi.dueSoonHint')}
          </span>
        </Link>

        {hasObjections ? (
          <Link
            href={collectionsHref(query, { tab: 'objections', filter: 'all', q: '' })}
            className="flex flex-col gap-1 rounded-card border border-amber/30 bg-amber/12 p-4 text-amber-ink transition-[transform,colors] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.98]"
          >
            <span className="text-[13px] text-amber-ink">{tPage('kpi.objections')}</span>
            <span className="text-xl font-semibold tabular-nums">{objected.length}</span>
            <span className="text-[13px] text-amber-ink">
              {canResolve ? tPage('kpi.objectionsOwnerHint') : tPage('kpi.objectionsEmployeeHint')}
            </span>
          </Link>
        ) : (
          <Link
            href={collectionsHref(query, { tab: 'payments', filter: 'all', q: '' })}
            className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 text-ink transition-[transform,colors] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.98]"
          >
            <span className="text-[13px] text-ink-soft">{tPage('kpi.collectedToday')}</span>
            <span className="text-xl font-semibold text-ink">
              <DualCurrencyMoney totals={summary.collectedToday} />
            </span>
            <span className="text-[13px] text-ink-soft tabular-nums">
              {tPage('kpi.paymentsCount', { count: summary.collectedTodayCount })}
            </span>
          </Link>
        )}
      </div>

      {manual ? <ManualNotices preview={manualPreview} isReadOnly={store.isReadOnly} /> : null}

      <nav
        aria-label={tPage('tabsLabel')}
        className="flex touch-pan-x [scrollbar-width:none] gap-1 overflow-x-auto rounded-field bg-paper-deep p-1 [&::-webkit-scrollbar]:hidden"
      >
        {COLLECTIONS_TABS.map((key) => {
          const active = query.tab === key;
          return (
            <Link
              key={key}
              href={collectionsHref(query, { tab: key, filter: 'all', method: 'all' })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-field px-3.5 text-sm font-medium whitespace-nowrap transition-[transform,colors] duration-150 ease-(--ease-out-expo) active:scale-[0.98] sm:flex-1',
                active ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
              )}
            >
              <span>{tPage(`tabs.${key}`)}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                  key === 'overdue' && counts.overdue > 0
                    ? 'bg-error/12 text-error-ink'
                    : key === 'objections' && counts.objections > 0
                      ? 'bg-amber/12 text-amber-ink'
                      : 'bg-paper-deep text-ink-soft',
                )}
              >
                {counts[key]}
              </span>
            </Link>
          );
        })}
      </nav>

      <CollectionsControls query={query} counts={tabCounts} />

      {query.tab === 'notices' ? (
        shownNotices.length === 0 ? (
          <p className="rounded-field bg-paper-deep p-4 text-sm text-ink-soft">
            {notices.length === 0 ? tPage('noNotices') : tPage('filteredEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {shownNotices.map((n) => {
              const failed = n.status === 'BOUNCED' || n.status === 'FAILED';
              const customerHref = n.customerId
                ? failed && canEditCustomer
                  ? `/customers/${n.customerId}/edit`
                  : `/customers/${n.customerId}`
                : null;
              return (
                <li
                  key={n.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium text-ink">{tPage(`noticeType.${n.type}`)}</span>
                    <span className="truncate text-ink-soft">
                      {n.name ?? n.recipientEmail} · {formatTime(n.at)}
                    </span>
                    {failed && customerHref ? (
                      <Link
                        href={customerHref}
                        className="mt-0.5 self-start text-[13px] font-medium text-link-active hover:underline"
                      >
                        {canEditCustomer ? tPage('fixEmail') : tPage('viewCustomer')}
                      </Link>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-medium',
                      failed
                        ? 'bg-error/12 text-error-ink'
                        : n.status === 'QUEUED'
                          ? 'bg-paper-deep text-ink-soft'
                          : 'bg-success/12 text-success-ink',
                    )}
                  >
                    {tPage(`noticeStatus.${n.status}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : query.tab === 'objections' ? (
        shownObjections.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-6 py-10 text-center">
            <MessageSquareWarningIcon aria-hidden="true" className="size-7 text-ink-soft" />
            <p className="text-sm text-ink-soft">
              {objected.length === 0 ? tPage('noObjections') : tPage('filteredEmpty')}
            </p>
          </div>
        ) : (
          <ObjectionsQueue items={shownObjections} canResolve={canResolve} />
        )
      ) : query.tab === 'payments' ? (
        shownPayments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-6 py-10 text-center">
            <ReceiptTextIcon aria-hidden="true" className="size-7 text-ink-soft" />
            <p className="text-sm text-ink-soft">
              {payments.length === 0 ? tPage('noPayments') : tPage('filteredEmpty')}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{tPage('paymentsTable.receipt')}</TableHead>
                    <TableHead className="px-4">{tPage('paymentsTable.customer')}</TableHead>
                    <TableHead className="px-4">{tPage('paymentsTable.method')}</TableHead>
                    <TableHead className="px-4">{tPage('paymentsTable.collector')}</TableHead>
                    <TableHead className="px-4 text-right">
                      {tPage('paymentsTable.amount')}
                    </TableHead>
                    <TableHead className="px-4 text-right">{tPage('table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4">
                        <div className="flex flex-col">
                          <Link
                            href={`/payments/${p.id}`}
                            className="font-semibold text-ink tabular-nums hover:underline"
                          >
                            {p.receiptNumber}
                          </Link>
                          <span className="text-[13px] text-ink-soft tabular-nums">
                            {formatDate(p.paymentDate)} · {formatTime(p.paymentDate)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4">
                        <Link
                          href={`/customers/${p.customerId}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {p.customerName}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4">
                        <span className="inline-flex rounded-full bg-paper-deep px-2.5 py-0.5 text-[13px] font-medium text-ink">
                          {tPay(`methods.${p.paymentMethod}`)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 text-ink-soft">{p.collectorName}</TableCell>
                      <TableCell className="px-4 text-right font-semibold text-ink">
                        <Money amount={p.amountPaid} currency={p.currency} />
                      </TableCell>
                      <TableCell className="px-4 text-right">
                        <Link
                          href={`/payments/${p.id}`}
                          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        >
                          {tPage('paymentsTable.viewReceipt')}
                          <ChevronRightIcon aria-hidden="true" className="size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface lg:hidden">
              {shownPayments.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/payments/${p.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                  >
                    <ReceiptTextIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium text-ink">
                        {p.receiptNumber} · {p.customerName}
                      </span>
                      <span className="text-[13px] text-ink-soft tabular-nums">
                        {tPay(`methods.${p.paymentMethod}`)} · {formatDate(p.paymentDate)}
                      </span>
                    </div>
                    <Money
                      amount={p.amountPaid}
                      currency={p.currency}
                      className="font-semibold whitespace-nowrap text-ink"
                    />
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-5 shrink-0 text-ink-soft"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )
      ) : shownCycles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-6 py-10 text-center">
          <BanknoteIcon aria-hidden="true" className="size-7 text-ink-soft" />
          <p className="text-sm text-ink-soft">
            {activeCycleSource.length === 0
              ? query.tab === 'due'
                ? tPage('noDue')
                : tPage('noOverdue')
              : tPage('filteredEmpty')}
          </p>
        </div>
      ) : (
        <>
          {/* Escritorio: tabla operativa con acciones directas sin callejones sin salida */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">{tPage('table.customer')}</TableHead>
                  <TableHead className="px-4">{tPage('table.cycle')}</TableHead>
                  <TableHead className="px-4">{tPage('table.due')}</TableHead>
                  <TableHead className="px-4">{tPage('table.status')}</TableHead>
                  <TableHead className="px-4 text-right">{tPage('table.amount')}</TableHead>
                  <TableHead className="px-4 text-right">{tPage('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownCycles.map((r) => {
                  const delta = dueDeltaLabel(r.paymentDueDate);
                  const blocked = r.objectedCount > 0;
                  const waHref = whatsappWithMessageHref(
                    r.phone,
                    tPage('whatsappReminder', {
                      name: r.name.split(' ')[0] ?? r.name,
                      amount: formatMoney(r.totalDue, r.currency),
                      date: formatDate(r.paymentDueDate),
                    }),
                  );

                  return (
                    <TableRow key={r.cycleId}>
                      <TableCell className="px-4">
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/customers/${r.customerId}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {r.name}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {blocked ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2 py-0.5 text-xs font-medium text-amber-ink">
                                <AlertTriangleIcon aria-hidden="true" className="size-3" />
                                {tPage('objectedCount', { count: r.objectedCount })}
                              </span>
                            ) : null}
                            {r.emailBouncedAt ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-error/12 px-2 py-0.5 text-xs font-medium text-error-ink">
                                <MailWarningIcon aria-hidden="true" className="size-3" />
                                {tPage('bouncedBadge')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 text-ink-soft tabular-nums">
                        <Link
                          href={`/customers/${r.customerId}/cycles/${r.cycleId}`}
                          className="hover:text-ink hover:underline"
                        >
                          {tPage('cycleNumber', {
                            number: r.cycleNumber,
                            date: formatDate(r.cutOffDate),
                          })}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 tabular-nums">
                        <div className="flex flex-col">
                          <span className="text-ink">{formatDate(r.paymentDueDate)}</span>
                          <span
                            className={cn(
                              'text-[13px]',
                              delta.tone === 'error'
                                ? 'text-error-ink'
                                : delta.tone === 'amber'
                                  ? 'text-amber-ink'
                                  : 'text-ink-soft',
                            )}
                          >
                            {delta.text}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4">
                        <CycleStatusBadge
                          status={cycleBadgeStatus(r.status, r.paymentDueDate, now)}
                        />
                      </TableCell>
                      <TableCell className="px-4 text-right font-semibold text-ink">
                        <Money amount={r.totalDue} currency={r.currency} />
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="flex items-center justify-end gap-2">
                          {waHref ? (
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={tPage('whatsappCustomer', { name: r.name })}
                              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                            >
                              <MessageCircleIcon aria-hidden="true" />
                            </a>
                          ) : null}
                          <Link
                            href={`/customers/${r.customerId}/cycles/${r.cycleId}`}
                            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          >
                            {tPage('viewCycle')}
                          </Link>
                          {!store.isReadOnly ? (
                            blocked ? (
                              <Link
                                href={
                                  canResolve
                                    ? `/customers/${r.customerId}/pay`
                                    : `/customers/${r.customerId}/cycles/${r.cycleId}`
                                }
                                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                              >
                                {canResolve ? tPage('review') : tPage('blocked')}
                              </Link>
                            ) : (
                              <Link
                                href={`/customers/${r.customerId}/pay`}
                                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                              >
                                <BanknoteIcon aria-hidden="true" className="size-4" />
                                {t('cycle.pay')}
                              </Link>
                            )
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Celular: tarjetas táctiles sin scroll horizontal */}
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface lg:hidden">
            {shownCycles.map((r) => {
              const delta = dueDeltaLabel(r.paymentDueDate);
              const blocked = r.objectedCount > 0;
              const waHref = whatsappWithMessageHref(
                r.phone,
                tPage('whatsappReminder', {
                  name: r.name.split(' ')[0] ?? r.name,
                  amount: formatMoney(r.totalDue, r.currency),
                  date: formatDate(r.paymentDueDate),
                }),
              );

              return (
                <li key={r.cycleId} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link
                        href={`/customers/${r.customerId}`}
                        className="truncate font-semibold text-ink hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span
                        className={cn(
                          'text-[13px] tabular-nums',
                          delta.tone === 'error'
                            ? 'text-error-ink'
                            : delta.tone === 'amber'
                              ? 'text-amber-ink'
                              : 'text-ink-soft',
                        )}
                      >
                        {delta.text}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Money
                        amount={r.totalDue}
                        currency={r.currency}
                        className="text-base font-semibold whitespace-nowrap text-ink"
                      />
                      <CycleStatusBadge
                        status={cycleBadgeStatus(r.status, r.paymentDueDate, now)}
                      />
                    </div>
                  </div>

                  {blocked || r.emailBouncedAt ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {blocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2.5 py-0.5 text-xs font-medium text-amber-ink">
                          <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
                          {tPage('objectedCount', { count: r.objectedCount })}
                        </span>
                      ) : null}
                      {r.emailBouncedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-error/12 px-2.5 py-0.5 text-xs font-medium text-error-ink">
                          <MailWarningIcon aria-hidden="true" className="size-3.5" />
                          {tPage('bouncedBadge')}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    {!store.isReadOnly ? (
                      blocked ? (
                        <Link
                          href={
                            canResolve
                              ? `/customers/${r.customerId}/pay`
                              : `/customers/${r.customerId}/cycles/${r.cycleId}`
                          }
                          className={buttonVariants({
                            variant: 'secondary',
                            size: 'sm',
                            className: 'flex-1',
                          })}
                        >
                          {canResolve ? tPage('review') : tPage('blocked')}
                        </Link>
                      ) : (
                        <Link
                          href={`/customers/${r.customerId}/pay`}
                          className={buttonVariants({
                            variant: 'secondary',
                            size: 'sm',
                            className: 'flex-1',
                          })}
                        >
                          <BanknoteIcon aria-hidden="true" className="size-4" />
                          {t('cycle.pay')}
                        </Link>
                      )
                    ) : null}
                    <Link
                      href={`/customers/${r.customerId}/cycles/${r.cycleId}`}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      {tPage('viewCycle')}
                    </Link>
                    {waHref ? (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={tPage('whatsappCustomer', { name: r.name })}
                        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                      >
                        <MessageCircleIcon aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
