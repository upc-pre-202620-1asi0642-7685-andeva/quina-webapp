import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  LockIcon,
  PackageIcon,
  PackagePlusIcon,
  SearchIcon,
  TruckIcon,
} from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { UnitCost } from '@/core/domain/catalog/unit-cost';
import { can } from '@/core/domain/identity/permissions';
import {
  countLowStockProducts,
  listProducts,
  type ProductListItem,
} from '@/infrastructure/db/queries/catalog';
import { requireStoreUser } from '@/presentation/auth/guards';
import {
  ProductStatusBadge,
  productStatus,
} from '@/presentation/components/catalog/product-status-badge';
import { ReplenishButton } from '@/presentation/components/catalog/replenish-button';
import { Money } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { cn } from '@/presentation/lib/utils';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const user = await requireStoreUser('/inventory', 'stock.read');
  const t = await getTranslations('Inventory.list');
  const { q = '', filter } = await searchParams;
  const query = q.slice(0, 60);
  const lowStockOnly = filter === 'low';

  const [products, lowStockCount, store] = await Promise.all([
    listProducts(user.storeId, query, { lowStockOnly }),
    countLowStockProducts(user.storeId),
    loadStoreContext(user.storeId),
  ]);

  const canManage = can(user.role, 'catalog.manage');
  const hasKardexCost = PlanLimits.of(store.tier).features.kardexAverageCost;
  const totalValuation =
    canManage && hasKardexCost ? UnitCost.inventoryValuation(products).toFixed2() : null;

  const stock = (item: ProductListItem) =>
    item.isService ? t('service') : `${formatQuantity(item.currentStock)} ${item.unitCode}`;

  const filterHref = (nextLow: boolean) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (nextLow) params.set('filter', 'low');
    const qs = params.toString();
    return qs ? `/inventory?${qs}` : '/inventory';
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/inventory/purchases" className={buttonVariants({ variant: 'secondary' })}>
              <TruckIcon aria-hidden="true" />
              {t('purchasesButton')}
            </Link>
            {lowStockCount > 0 ? <ReplenishButton /> : null}
            <Link href="/inventory/new" className={buttonVariants()}>
              <PackagePlusIcon aria-hidden="true" />
              {t('newButton')}
            </Link>
          </div>
        ) : null}
      </header>

      {canManage ? (
        <section
          aria-label={t('valuationLabel')}
          className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-4"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-ink-soft">{t('valuationLabel')}</span>
            {hasKardexCost && totalValuation ? (
              <Money
                amount={totalValuation}
                currency="PEN"
                className="text-2xl font-semibold text-ink"
              />
            ) : (
              <Link
                href="/settings#plans"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-link-active underline-offset-4 hover:underline"
              >
                <LockIcon aria-hidden="true" className="size-3.5" />
                {t('valuationLocked')}
              </Link>
            )}
          </div>
          {lowStockCount > 0 ? (
            <Link
              href={filterHref(!lowStockOnly)}
              className="inline-flex items-center gap-2 rounded-full bg-amber/12 px-3 py-1.5 text-xs font-medium text-amber-ink hover:opacity-90"
            >
              <AlertTriangleIcon aria-hidden="true" className="size-4" />
              {t('lowStockAlert', { count: lowStockCount })}
            </Link>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Form role="search" action="" className="flex flex-1 gap-2">
          {lowStockOnly ? <input type="hidden" name="filter" value="low" /> : null}
          <label htmlFor="product-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <Input
            id="product-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className="flex-1"
          />
          <button type="submit" className={buttonVariants({ variant: 'secondary', size: 'icon' })}>
            <SearchIcon aria-hidden="true" />
            <span className="sr-only">{t('searchSubmit')}</span>
          </button>
        </Form>

        <div role="group" aria-label={t('filterGroupLabel')} className="flex items-center gap-1.5">
          <Link
            href={filterHref(false)}
            aria-current={!lowStockOnly ? 'true' : undefined}
            className={cn(
              'inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors',
              !lowStockOnly
                ? 'bg-soft text-soft-ink'
                : 'border border-line bg-surface text-ink hover:bg-surface-hover',
            )}
          >
            {t('filterAll')}
          </Link>
          <Link
            href={filterHref(true)}
            aria-current={lowStockOnly ? 'true' : undefined}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium tabular-nums transition-colors',
              lowStockOnly
                ? 'bg-amber/12 text-amber-ink'
                : 'border border-line bg-surface text-ink hover:bg-surface-hover',
            )}
          >
            <AlertTriangleIcon aria-hidden="true" className="size-4" />
            {t('filterLowStock', { count: lowStockCount })}
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <PackageIcon aria-hidden="true" className="size-8 text-ink-soft" />
          {query || lowStockOnly ? (
            <>
              <p className="text-base text-ink">
                {query ? t('noResults', { query }) : t('noLowStockResults')}
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
              {canManage ? (
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
            {products.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/inventory/${item.id}`}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active"
                >
                  <Thumb item={item} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-base font-medium text-ink">{item.name}</span>
                    <span className="text-sm text-ink">
                      <Money amount={item.cashPrice} currency="PEN" />
                      <span className="text-ink-soft"> · </span>
                      <span className="text-ink-soft">{t('colCredit')} </span>
                      <Money amount={item.creditPrice} currency="PEN" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <ProductStatusBadge status={productStatus(item)} />
                      <span className="text-[13px] text-ink-soft tabular-nums">{stock(item)}</span>
                    </div>
                  </div>
                  <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
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
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('colStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((item) => (
                  <tr key={item.id} className="border-t border-line hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventory/${item.id}`}
                        className="flex items-center gap-3 font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-link-active"
                      >
                        <Thumb item={item} />
                        <span className="flex flex-col">
                          {item.name}
                          {item.brand ? (
                            <span className="text-[13px] font-normal text-ink-soft">
                              {item.brand}
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
                    <td className="px-4 py-3 text-right text-ink tabular-nums">{stock(item)}</td>
                    <td className="px-4 py-3">
                      <ProductStatusBadge status={productStatus(item)} />
                    </td>
                  </tr>
                ))}
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
      className="size-10 shrink-0 rounded-field border border-line object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-field bg-paper-deep text-ink-soft"
    >
      <PackageIcon className="size-5" />
    </span>
  );
}
