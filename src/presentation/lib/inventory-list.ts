import { Quantity } from '@/core/domain/catalog/quantity';
import { Dec } from '@/core/domain/shared/decimal';
import type { ProductListItem } from '@/infrastructure/db/queries/catalog';
import { productStatus } from '@/presentation/components/catalog/product-status-badge';

export const INVENTORY_FILTERS = ['all', 'low', 'noStock', 'services', 'inactive'] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export const INVENTORY_SORTS = ['name', 'stockAsc', 'priceAsc', 'priceDesc', 'valueDesc'] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

export type InventoryListQuery = {
  q: string;
  filter: InventoryFilter;
  sort: InventorySort;
};

export function parseInventoryListQuery(
  raw: { q?: string; filter?: string; sort?: string },
  options: { canSeeCosts?: boolean } = {},
): InventoryListQuery {
  const q = (raw.q ?? '').slice(0, 60);
  const filter = INVENTORY_FILTERS.includes(raw.filter as InventoryFilter)
    ? (raw.filter as InventoryFilter)
    : 'all';
  const rawSort = INVENTORY_SORTS.includes(raw.sort as InventorySort)
    ? (raw.sort as InventorySort)
    : 'name';
  const sort = rawSort === 'valueDesc' && !options.canSeeCosts ? 'name' : rawSort;
  return { q, filter, sort };
}

export function inventoryListHref(query: Partial<InventoryListQuery>): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter);
  if (query.sort && query.sort !== 'name') params.set('sort', query.sort);
  const qs = params.toString();
  return qs ? `/inventory?${qs}` : '/inventory';
}

export function matchesInventoryFilter(item: ProductListItem, filter: InventoryFilter): boolean {
  const status = productStatus(item);
  switch (filter) {
    case 'all':
      return true;
    case 'low':
      return (
        item.isActive &&
        !item.isService &&
        !Quantity.isZero(item.minimumStock) &&
        Quantity.compare(item.currentStock, item.minimumStock) <= 0
      );
    case 'noStock':
      return item.isActive && !item.isService && status === 'noStock';
    case 'services':
      return item.isActive && item.isService;
    case 'inactive':
      return !item.isActive;
  }
}

export function productStockValue(item: ProductListItem): Dec {
  if (item.isService || !item.isActive) return new Dec(0);
  return new Dec(Quantity.valuedAt(item.currentStock, item.currentAverageCost));
}

export function filterAndSortProducts(
  items: readonly ProductListItem[],
  { filter, sort }: Pick<InventoryListQuery, 'filter' | 'sort'>,
): ProductListItem[] {
  const filtered = items.filter((item) => matchesInventoryFilter(item, filter));
  const byName = (a: ProductListItem, b: ProductListItem) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  };

  if (sort === 'name') {
    return [...filtered].sort(byName);
  }
  if (sort === 'stockAsc') {
    return [...filtered].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.isService !== b.isService) return a.isService ? 1 : -1;
      const cmp = new Dec(a.currentStock).comparedTo(new Dec(b.currentStock));
      return cmp !== 0 ? cmp : byName(a, b);
    });
  }
  if (sort === 'priceAsc') {
    return [...filtered].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const cmp = new Dec(a.cashPrice).comparedTo(new Dec(b.cashPrice));
      return cmp !== 0 ? cmp : byName(a, b);
    });
  }
  if (sort === 'priceDesc') {
    return [...filtered].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const cmp = new Dec(b.cashPrice).comparedTo(new Dec(a.cashPrice));
      return cmp !== 0 ? cmp : byName(a, b);
    });
  }
  return [...filtered].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const cmp = productStockValue(b).comparedTo(productStockValue(a));
    return cmp !== 0 ? cmp : byName(a, b);
  });
}

export type InventorySummary = {
  totalActive: number;
  criticalCount: number;
  counts: Record<InventoryFilter, number>;
};

export function summarizeInventoryList(items: readonly ProductListItem[]): InventorySummary {
  const counts: Record<InventoryFilter, number> = {
    all: items.length,
    low: 0,
    noStock: 0,
    services: 0,
    inactive: 0,
  };
  let totalActive = 0;
  let criticalCount = 0;
  for (const item of items) {
    if (item.isActive) totalActive += 1;
    const isLow = matchesInventoryFilter(item, 'low');
    const isNoStock = matchesInventoryFilter(item, 'noStock');
    if (isLow) counts.low += 1;
    if (isNoStock) counts.noStock += 1;
    if (isLow || isNoStock) criticalCount += 1;
    if (matchesInventoryFilter(item, 'services')) counts.services += 1;
    if (matchesInventoryFilter(item, 'inactive')) counts.inactive += 1;
  }
  return { totalActive, criticalCount, counts };
}
