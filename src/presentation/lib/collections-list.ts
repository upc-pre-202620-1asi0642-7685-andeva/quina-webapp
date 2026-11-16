import { BusinessDate } from '@/core/domain/shared/business-date';
import { Dec } from '@/core/domain/shared/decimal';
import { Money, type Currency } from '@/core/domain/shared/money';
import type {
  CollectionRow,
  ObjectedChargeRow,
  RecentPaymentRow,
  TodayNotice,
} from '@/infrastructure/db/queries/collections';
import { whatsappHref } from '@/presentation/lib/customer-list';

export const COLLECTIONS_TABS = ['due', 'overdue', 'objections', 'payments', 'notices'] as const;
export type CollectionsTab = (typeof COLLECTIONS_TABS)[number];

export const COLLECTIONS_FILTERS = ['all', 'dueSoon', 'blocked', 'bounced'] as const;
export type CollectionsFilter = (typeof COLLECTIONS_FILTERS)[number];

export const COLLECTIONS_SORTS = ['dueDate', 'amountDesc', 'name'] as const;
export type CollectionsSort = (typeof COLLECTIONS_SORTS)[number];

export const PAYMENT_METHOD_FILTERS = ['all', 'CASH', 'YAPE', 'PLIN', 'TRANSFER'] as const;
export type PaymentMethodFilter = (typeof PAYMENT_METHOD_FILTERS)[number];

export const DUE_SOON_DAYS = 3;

export type CollectionsQuery = {
  tab: CollectionsTab;
  q: string;
  filter: CollectionsFilter;
  sort: CollectionsSort;
  method: PaymentMethodFilter;
};

export function parseCollectionsQuery(raw: {
  tab?: string;
  q?: string;
  filter?: string;
  sort?: string;
  method?: string;
}): CollectionsQuery {
  const tab = COLLECTIONS_TABS.includes(raw.tab as CollectionsTab)
    ? (raw.tab as CollectionsTab)
    : 'due';
  const q = (raw.q ?? '').slice(0, 60);
  const filter = COLLECTIONS_FILTERS.includes(raw.filter as CollectionsFilter)
    ? (raw.filter as CollectionsFilter)
    : 'all';
  const sort = COLLECTIONS_SORTS.includes(raw.sort as CollectionsSort)
    ? (raw.sort as CollectionsSort)
    : 'dueDate';
  const method = PAYMENT_METHOD_FILTERS.includes(raw.method as PaymentMethodFilter)
    ? (raw.method as PaymentMethodFilter)
    : 'all';
  return { tab, q, filter, sort, method };
}

export function collectionsHref(
  current: Partial<CollectionsQuery>,
  patch?: Partial<CollectionsQuery>,
): string {
  const merged: Partial<CollectionsQuery> = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.tab && merged.tab !== 'due') params.set('tab', merged.tab);
  if (merged.q?.trim()) params.set('q', merged.q.trim());
  if (merged.filter && merged.filter !== 'all') params.set('filter', merged.filter);
  if (merged.sort && merged.sort !== 'dueDate') params.set('sort', merged.sort);
  if (merged.method && merged.method !== 'all') params.set('method', merged.method);
  const qs = params.toString();
  return qs ? `/collections?${qs}` : '/collections';
}

/** Días calendario en Lima desde hoy hasta `paymentDueDate` (negativo = días de atraso). */
export function collectionDaysDelta(paymentDueDate: Date, now: Date): number {
  const today = BusinessDate.fromInstant(now);
  const due = BusinessDate.fromInstant(paymentDueDate);
  return BusinessDate.daysBetween(today, due);
}

export function matchesCollectionFilter(
  row: CollectionRow,
  filter: CollectionsFilter,
  now: Date,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'dueSoon': {
      const days = collectionDaysDelta(row.paymentDueDate, now);
      return row.status === 'BILLED' && days >= 0 && days <= DUE_SOON_DAYS;
    }
    case 'blocked':
      return row.objectedCount > 0;
    case 'bounced':
      return row.emailBouncedAt !== null;
  }
}

export function filterAndSortCollections(
  rows: readonly CollectionRow[],
  query: Pick<CollectionsQuery, 'q' | 'filter' | 'sort'>,
  now: Date,
): CollectionRow[] {
  const term = query.q.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!matchesCollectionFilter(row, query.filter, now)) return false;
    if (!term) return true;
    return row.name.toLowerCase().includes(term);
  });

  if (query.sort === 'name') {
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  if (query.sort === 'amountDesc') {
    return [...filtered].sort((a, b) => {
      const cmp = new Dec(b.totalDue).comparedTo(a.totalDue);
      if (cmp !== 0) return cmp;
      return a.paymentDueDate.getTime() - b.paymentDueDate.getTime();
    });
  }
  return [...filtered].sort((a, b) => {
    const cmp = a.paymentDueDate.getTime() - b.paymentDueDate.getTime();
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, 'es');
  });
}

export function filterObjectedCharges(
  rows: readonly ObjectedChargeRow[],
  q: string,
): ObjectedChargeRow[] {
  const term = q.trim().toLowerCase();
  if (!term) return [...rows];
  return rows.filter(
    (r) =>
      r.customerName.toLowerCase().includes(term) ||
      (r.objectionNote?.toLowerCase().includes(term) ?? false) ||
      r.items.some((i) => i.name.toLowerCase().includes(term)),
  );
}

export function filterRecentPayments(
  rows: readonly RecentPaymentRow[],
  query: Pick<CollectionsQuery, 'q' | 'method'>,
): RecentPaymentRow[] {
  const term = query.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (query.method !== 'all' && r.paymentMethod !== query.method) return false;
    if (!term) return true;
    return (
      r.customerName.toLowerCase().includes(term) ||
      r.receiptNumber.toLowerCase().includes(term) ||
      r.collectorName.toLowerCase().includes(term)
    );
  });
}

export function filterTodayNotices(rows: readonly TodayNotice[], q: string): TodayNotice[] {
  const term = q.trim().toLowerCase();
  if (!term) return [...rows];
  return rows.filter(
    (n) =>
      (n.name?.toLowerCase().includes(term) ?? false) ||
      n.recipientEmail.toLowerCase().includes(term),
  );
}

export type CurrencyTotals = { pen: string; usd: string };

function sumByCurrency(items: readonly { amount: string; currency: Currency }[]): CurrencyTotals {
  const pen = Money.sum(
    items.filter((i) => i.currency === 'PEN').map((i) => Money.of(i.amount, 'PEN')),
    'PEN',
  ).toFixed2();
  const usd = Money.sum(
    items.filter((i) => i.currency === 'USD').map((i) => Money.of(i.amount, 'USD')),
    'USD',
  ).toFixed2();
  return { pen, usd };
}

export type CollectionsSummary = {
  dueCount: number;
  overdueCount: number;
  dueSoonCount: number;
  blockedCount: number;
  bouncedCount: number;
  totalCollectable: CurrencyTotals;
  totalOverdue: CurrencyTotals;
  collectedToday: CurrencyTotals;
  collectedTodayCount: number;
};

export function summarizeCollections(
  rows: readonly CollectionRow[],
  payments: readonly RecentPaymentRow[],
  now: Date,
): CollectionsSummary {
  const todayIso = BusinessDate.toISO(BusinessDate.fromInstant(now));
  const due = rows.filter((r) => r.status === 'BILLED');
  const overdue = rows.filter((r) => r.status === 'OVERDUE');
  const dueSoon = due.filter((r) => {
    const days = collectionDaysDelta(r.paymentDueDate, now);
    return days >= 0 && days <= DUE_SOON_DAYS;
  });
  const blocked = rows.filter((r) => r.objectedCount > 0);
  const bounced = rows.filter((r) => r.emailBouncedAt !== null);
  const todayPayments = payments.filter(
    (p) => BusinessDate.toISO(BusinessDate.fromInstant(p.paymentDate)) === todayIso,
  );

  return {
    dueCount: due.length,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    blockedCount: blocked.length,
    bouncedCount: bounced.length,
    totalCollectable: sumByCurrency(
      rows.map((r) => ({ amount: r.totalDue, currency: r.currency })),
    ),
    totalOverdue: sumByCurrency(overdue.map((r) => ({ amount: r.totalDue, currency: r.currency }))),
    collectedToday: sumByCurrency(
      todayPayments.map((p) => ({ amount: p.amountPaid, currency: p.currency })),
    ),
    collectedTodayCount: todayPayments.length,
  };
}

export function whatsappWithMessageHref(
  phone: string | null | undefined,
  message: string,
): string | null {
  const base = whatsappHref(phone);
  if (!base) return null;
  return `${base}?text=${encodeURIComponent(message)}`;
}
