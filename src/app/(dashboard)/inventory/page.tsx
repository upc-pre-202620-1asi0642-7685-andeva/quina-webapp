import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  LockIcon,
  PackageIcon,
  PackagePlusIcon,
  TruckIcon,
  UsersIcon,
} from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { Quantity } from '@/core/domain/catalog/quantity';
import { UnitCost } from '@/core/domain/catalog/unit-cost';
import { can } from '@/core/domain/identity/permissions';
import { Dec } from '@/core/domain/shared/decimal';
import { listProducts, type ProductListItem } from '@/infrastructure/db/queries/catalog';
import { requireStoreUser } from '@/presentation/auth/guards';
import { InventoryListControls } from '@/presentation/components/catalog/inventory-list-controls';
import {
  ProductStatusBadge,
  productStatus,
} from '@/presentation/components/catalog/product-status-badge';
import { ReplenishButton } from '@/presentation/components/catalog/replenish-button';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import {
  filterAndSortProducts,
  inventoryListHref,
  parseInventoryListQuery,
  productStockValue,
  summarizeInventoryList,
} from '@/presentation/lib/inventory-list';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

function stockBarClass(item: ProductListItem): string {
  const status = productStatus(item);
  if (status === 'noStock') return 'bg-error';
  if (status === 'lowStock') return 'bg-amber';
  return 'bg-primary';
}

function stockBarPercent(item: ProductListItem): number {
  if (item.isService || Quantity.isZero(item.minimumStock)) return 100;
  const current = new Dec(item.currentStock);
  const min = new Dec(item.minimumStock);
  if (current.lte(0)) return 0;
  const pct = current.div(min.times(2)).times(100).toNumber();
  return Math.min(100, Math.max(8, Math.round(pct)));
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; sort?: string }>;
}) {
  const user = await requireStoreUser('/inventory', 'stock.read');
  const t = await getTranslations('Inventory.list');
  const raw = await searchParams;

  const canManage = can(user.role, 'catalog.manage');
  const canPurchases = can(user.role, 'purchases.manage');

  const [store, rawSearch] = await Promise.all([
    loadStoreContext(user.storeId),
    Promise.resolve(raw),
  ]);

  const hasKardexCost = PlanLimits.of(store.tier).features.kardexAverageCost;
  const canSeeCosts = canManage && hasKardexCost;
  const query = parseInventoryListQuery(rawSearch, { canSeeCosts });

  const allMatchingSearch = await listProducts(user.storeId, query.q);
  const summary = summarizeInventoryList(allMatchingSearch);
  const products = filterAndSortProducts(allMatchingSearch, query);

  const isReadOnly = store.isReadOnly;
  const productLimit = PlanLimits.of(store.tier).products;
  const activeUsage = store.usage.products;
  const quotaRatio = productLimit ? activeUsage / productLimit : 0;
  const totalValuation = canSeeCosts
    ? UnitCost.inventoryValuation(allMatchingSearch).toFixed2()
    : null;

  const hasInitialProducts = allMatchingSearch.length > 0 || Boolean(query.q);

  const stock = (item: ProductListItem) =>
    item.isService ? t('service') : `${formatQuantity(item.currentStock)} ${item.unitCode}`;

  const stockSub = (item: ProductListItem) => {
    if (item.isService || Quantity.isZero(item.minimumStock)) return null;
    return t('minStockShort', { min: `${formatQuantity(item.minimumStock)} ${item.unitCode}` });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">
            {canManage ? t('subtitle') : t('subtitleEmployee')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPurchases ? (
            <>
              <Link
                href="/inventory/suppliers"
                className={buttonVariants({ variant: 'secondary' })}
              >
                <UsersIcon aria-hidden="true" />
                {t('suppliersButton')}
              </Link>
              <Link
                href="/inventory/purchases"
                className={buttonVariants({ variant: 'secondary' })}
              >
                <TruckIcon aria-hidden="true" />
                {t('purchasesButton')}
              </Link>
              {summary.counts.low > 0 && !isReadOnly ? <ReplenishButton /> : null}
            </>
          ) : null}
          {canManage && !isReadOnly ? (
            <Link href="/inventory/new" className={buttonVariants()}>
              <PackagePlusIcon aria-hidden="true" />
              {t('newButton')}
            </Link>
          ) : null}
        </div>
      </header>

      {isReadOnly && (canManage || canPurchases) ? (
        <Notice tone="warning">
          <p>{t('readOnlyNotice')}</p>
        </Notice>
      ) : null}

      {hasInitialProducts ? (
        <>
          {allMatchingSearch.length > 0 ? (
            <dl
              className={cn(
                'grid grid-cols-2 divide-x divide-line overflow-hidden rounded-card border border-line bg-surface',
                canManage ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
              )}
            >
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className="text-[13px] text-ink-soft">{t('summaryActive')}</dt>
                <dd className="flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-semibold text-ink tabular-nums">
                    {summary.totalActive}
                  </span>
                  {productLimit !== null && !query.q ? (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                        quotaRatio >= 1
                          ? 'bg-error/12 text-error-ink'
                          : quotaRatio >= 0.85
                            ? 'bg-amber/12 text-amber-ink'
                            : 'bg-paper-deep text-ink-soft',
                      )}
                    >
                      {activeUsage} / {productLimit}
                    </span>
                  ) : null}
                </dd>
              </div>

              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className="text-[13px] text-ink-soft">{t('summaryAttention')}</dt>
                <dd className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-ink tabular-nums">
                    {summary.criticalCount}
                  </span>
                  {summary.counts.low > 0 ? (
                    <Link
                      href={inventoryListHref({
                        q: query.q,
                        filter: query.filter === 'low' ? 'all' : 'low',
                        sort: query.sort,
                      })}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full bg-amber/12 px-2.5 py-1 text-xs font-medium text-amber-ink tabular-nums hover:opacity-90"
                    >
                      <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
                      {t('lowStockShort', { count: summary.counts.low })}
                    </Link>
                  ) : null}
                </dd>
              </div>

              {canManage ? (
                <div className="col-span-2 flex flex-col gap-0.5 border-t border-line px-4 py-3 sm:col-span-1 sm:border-t-0">
                  <dt className="text-[13px] text-ink-soft">{t('valuationLabel')}</dt>
                  <dd>
                    {hasKardexCost && totalValuation ? (
                      <Money
                        amount={totalValuation}
                        currency="PEN"
                        className="text-lg font-semibold text-ink"
                      />
                    ) : (
                      <Link
                        href="/settings/subscription"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-link-active underline-offset-4 hover:underline"
                      >
                        <LockIcon aria-hidden="true" className="size-3.5 shrink-0" />
                        {t('valuationLocked')}
                      </Link>
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <InventoryListControls
            query={query.q}
            filter={query.filter}
            sort={query.sort}
            counts={summary.counts}
            canSeeCosts={canSeeCosts}
          />
        </>
      ) : null}

      {products.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <PackageIcon aria-hidden="true" className="size-8 text-ink-soft" />
          {query.q || query.filter !== 'all' ? (
            <>
              <p className="text-base text-ink">
                {query.q
                  ? t('noResults', { query: query.q })
                  : query.filter === 'low'
                    ? t('noLowStockResults')
                    : t('noFilterResults')}
              </p>
              <Link href="/inventory" className={buttonVariants({ variant: 'secondary' })}>
                {t('clearSearch')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">{t('emptyTitle')}</h2>
              <p className="max-w-sm text-sm text-ink-soft">
                {canManage ? t('emptyBody') : t('emptyEmployee')}
              </p>
              {canManage && !isReadOnly ? (
                <Link href="/inventory/new" className={buttonVariants({ className: 'mt-2' })}>
                  <PackagePlusIcon aria-hidden="true" />
                  {t('newButton')}
                </Link>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <section aria-label={t('title')} className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft tabular-nums">
            {t('count', { count: products.length })}
          </p>

          {/* Celular: lista de tarjetas (DESIGN.md §5) */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {products.map((item) => {
              const sub = stockSub(item);
              const val = canSeeCosts ? productStockValue(item).toFixed(2) : null;
              return (
                <li key={item.id}>
                  <Link
                    href={`/inventory/${item.id}`}
                    className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-[background-color,transform] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.99]"
                  >
                    <Thumb item={item} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-base font-medium text-ink">{item.name}</span>
                      </div>
                      {item.brand || item.barcode ? (
                        <span className="truncate text-xs text-ink-soft tabular-nums">
                          {[item.brand, item.barcode].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                      <span className="text-sm text-ink">
                        <Money amount={item.cashPrice} currency="PEN" />
                        <span className="text-ink-soft"> · </span>
                        <span className="text-ink-soft">{t('colCredit')} </span>
                        <Money amount={item.creditPrice} currency="PEN" />
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <ProductStatusBadge status={productStatus(item)} />
                        <span className="text-[13px] font-medium text-ink tabular-nums">
                          {stock(item)}
                        </span>
                        {sub ? (
                          <span className="text-xs text-ink-soft tabular-nums">{sub}</span>
                        ) : null}
                        {val && !item.isService && item.isActive ? (
                          <span className="text-xs text-ink-soft tabular-nums">
                            · <Money amount={val} currency="PEN" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-5 shrink-0 text-ink-soft"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Escritorio: tabla con encabezado fijo */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-deep text-left text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colName')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('colCash')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('colCredit')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('colStock')}
                  </th>
                  {canSeeCosts ? (
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('colValue')}
                    </th>
                  ) : null}
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((item) => {
                  const sub = stockSub(item);
                  const val = canSeeCosts ? productStockValue(item).toFixed(2) : null;
                  return (
                    <tr key={item.id} className="border-t border-line hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <Link
                          href={`/inventory/${item.id}`}
                          className="flex items-center gap-3 font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-link-active"
                        >
                          <Thumb item={item} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{item.name}</span>
                            {item.brand || item.barcode ? (
                              <span className="truncate text-[13px] font-normal text-ink-soft tabular-nums">
                                {[item.brand, item.barcode].filter(Boolean).join(' · ')}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-ink">
                        <Money amount={item.cashPrice} currency="PEN" />
                      </td>
                      <td className="px-4 py-3 text-right text-ink">
                        <Money amount={item.creditPrice} currency="PEN" />
                      </td>
                      <td className="px-4 py-3 text-right text-ink tabular-nums">
                        <div className="inline-flex flex-col items-end gap-1">
                          <span>{stock(item)}</span>
                          {!item.isService && !Quantity.isZero(item.minimumStock) ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-ink-soft">{sub}</span>
                              <span
                                aria-hidden="true"
                                className="h-1 w-12 overflow-hidden rounded-full bg-paper-deep"
                              >
                                <span
                                  className={cn('block h-full rounded-full', stockBarClass(item))}
                                  style={{ width: `${stockBarPercent(item)}%` }}
                                />
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      {canSeeCosts ? (
                        <td className="px-4 py-3 text-right text-ink tabular-nums">
                          {item.isService || !item.isActive ? (
                            <span className="text-ink-soft">—</span>
                          ) : (
                            <Money amount={val!} currency="PEN" />
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <ProductStatusBadge status={productStatus(item)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Thumb({ item }: { item: ProductListItem }) {
  return item.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público, sin optimizador
    <img
      src={item.imageUrl}
      alt=""
      loading="lazy"
      className="size-11 shrink-0 rounded-field border border-line object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-field bg-paper-deep text-ink-soft"
    >
      <PackageIcon className="size-5" />
    </span>
  );
}
