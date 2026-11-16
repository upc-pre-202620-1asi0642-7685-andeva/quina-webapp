import { Dec } from '@/core/domain/shared/decimal';
import { Money, type Currency } from '@/core/domain/shared/money';
import type { CustomerListItem } from '@/infrastructure/db/queries/customers';

export const CUSTOMER_FILTERS = [
  'all',
  'collectable',
  'overdue',
  'active',
  'suspended',
  'cashOnly',
  'inactive',
] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

export const CUSTOMER_SORTS = ['name', 'debt', 'available'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export type CustomerListQuery = {
  q: string;
  filter: CustomerFilter;
  sort: CustomerSort;
};

export function parseCustomerListQuery(raw: {
  q?: string;
  filter?: string;
  sort?: string;
}): CustomerListQuery {
  const q = (raw.q ?? '').slice(0, 60);
  const filter = CUSTOMER_FILTERS.includes(raw.filter as CustomerFilter)
    ? (raw.filter as CustomerFilter)
    : 'all';
  const sort = CUSTOMER_SORTS.includes(raw.sort as CustomerSort)
    ? (raw.sort as CustomerSort)
    : 'name';
  return { q, filter, sort };
}

export function customerListHref(query: Partial<CustomerListQuery>): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter);
  if (query.sort && query.sort !== 'name') params.set('sort', query.sort);
  const qs = params.toString();
  return qs ? `/customers?${qs}` : '/customers';
}

export function availableCreditAmount(
  account: { currency: string; creditLimit: string; currentBalance: string } | null,
): { amount: string; currency: Currency; usedPercent: number; overLimit: boolean } | null {
  if (!account) return null;
  const currency = account.currency as Currency;
  const limit = Money.of(account.creditLimit, currency);
  const balance = Money.of(account.currentBalance, currency);
  const left = limit.minus(balance);
  const overLimit = left.isNegative();
  const limitDec = limit.decimal();
  const usedPercent = limitDec.isZero()
    ? 0
    : Math.min(
        100,
        Math.max(0, Math.round(balance.decimal().dividedBy(limitDec).times(100).toNumber())),
      );
  return {
    amount: (overLimit ? Money.zero(currency) : left).toFixed2(),
    currency,
    usedPercent,
    overLimit,
  };
}

export function customerInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0).toUpperCase();
  const last = lastName.trim().charAt(0).toUpperCase();
  return `${first}${last}` || '?';
}

export function whatsappHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) {
    return `https://wa.me/51${digits}`;
  }
  if (digits.length >= 11 && digits.startsWith('51')) {
    return `https://wa.me/${digits}`;
  }
  return null;
}

export function matchesCustomerFilter(item: CustomerListItem, filter: CustomerFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'collectable':
      return item.isActive && item.collections.payableCyclesCount > 0;
    case 'overdue':
      return item.isActive && item.collections.hasOverdue;
    case 'active':
      return item.isActive && item.account?.status === 'ACTIVE';
    case 'suspended':
      return (
        item.isActive &&
        (item.account?.status === 'SUSPENDED' || item.account?.status === 'BLOCKED')
      );
    case 'cashOnly':
      return item.isActive && item.account === null;
    case 'inactive':
      return !item.isActive;
  }
}

export function filterAndSortCustomers(
  items: readonly CustomerListItem[],
  { filter, sort }: Pick<CustomerListQuery, 'filter' | 'sort'>,
): CustomerListItem[] {
  const filtered = items.filter((item) => matchesCustomerFilter(item, filter));
  if (sort === 'name') {
    return [...filtered].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es');
    });
  }
  if (sort === 'debt') {
    return [...filtered].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const aDebt = new Dec(a.account?.currentBalance ?? '0');
      const bDebt = new Dec(b.account?.currentBalance ?? '0');
      const cmp = bDebt.comparedTo(aDebt);
      if (cmp !== 0) return cmp;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es');
    });
  }
  return [...filtered].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aAvail =
      a.account && a.account.status === 'ACTIVE'
        ? new Dec(a.account.creditLimit).minus(a.account.currentBalance)
        : new Dec(-1);
    const bAvail =
      b.account && b.account.status === 'ACTIVE'
        ? new Dec(b.account.creditLimit).minus(b.account.currentBalance)
        : new Dec(-1);
    const cmp = aAvail.comparedTo(bAvail);
    if (cmp !== 0) return cmp;
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es');
  });
}

export type CustomerDirectorySummary = {
  totalActive: number;
  withCredit: number;
  collectableCount: number;
  overdueCount: number;
  counts: Record<CustomerFilter, number>;
};

export function summarizeCustomerList(
  items: readonly CustomerListItem[],
): CustomerDirectorySummary {
  const counts: Record<CustomerFilter, number> = {
    all: items.length,
    collectable: 0,
    overdue: 0,
    active: 0,
    suspended: 0,
    cashOnly: 0,
    inactive: 0,
  };
  let totalActive = 0;
  let withCredit = 0;
  for (const item of items) {
    if (item.isActive) totalActive += 1;
    if (item.isActive && item.account) withCredit += 1;
    if (matchesCustomerFilter(item, 'collectable')) counts.collectable += 1;
    if (matchesCustomerFilter(item, 'overdue')) counts.overdue += 1;
    if (matchesCustomerFilter(item, 'active')) counts.active += 1;
    if (matchesCustomerFilter(item, 'suspended')) counts.suspended += 1;
    if (matchesCustomerFilter(item, 'cashOnly')) counts.cashOnly += 1;
    if (matchesCustomerFilter(item, 'inactive')) counts.inactive += 1;
  }
  return {
    totalActive,
    withCredit,
    collectableCount: counts.collectable,
    overdueCount: counts.overdue,
    counts,
  };
}
