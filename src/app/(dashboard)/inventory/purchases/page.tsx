import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FileTextIcon,
  LockIcon,
  PaperclipIcon,
  PlusIcon,
  TruckIcon,
  UsersIcon,
} from 'lucide-react';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { Dec } from '@/core/domain/shared/decimal';
import {
  countMonthlyPurchaseReceipts,
  listDraftPurchaseOrders,
  listPurchases,
} from '@/infrastructure/db/queries/purchases';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PurchaseListControls } from '@/presentation/components/catalog/purchase-list-controls';
import {
  DiscardPurchaseOrderButton,
  ReplenishButton,
} from '@/presentation/components/catalog/replenish-button';
import { Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; q?: string }>;
}) {
  const user = await requireStoreUser('/inventory/purchases', 'purchases.manage');
  const t = await getTranslations('Purchases');
  const { supplierId, q = '' } = await searchParams;
  const activeSupplierId = supplierId && supplierId.length > 0 ? supplierId : undefined;
  const query = q.trim().slice(0, 60);

  const [allPurchases, draftOrders, suppliers, store, receiptsThisMonth] = await Promise.all([
    listPurchases(user.storeId, activeSupplierId),
    listDraftPurchaseOrders(user.storeId),
    new DrizzlePurchaseRepository().suppliers(user.storeId),
    loadStoreContext(user.storeId),
    countMonthlyPurchaseReceipts(user.storeId),
  ]);

  const term = query.toLowerCase();
  const purchases = term
    ? allPurchases.filter((p) => {
        const doc = `${p.series ? `${p.series}-` : ''}${p.documentNumber}`.toLowerCase();
        return (
          p.supplierName.toLowerCase().includes(term) ||
          p.supplierTaxId.toLowerCase().includes(term) ||
          doc.includes(term)
        );
      })
    : allPurchases;

  const isReadOnly = store.isReadOnly;
  const receiptLimit = PlanLimits.of(store.tier).receiptsPerMonth;
  const hasReceiptsFeature = PlanLimits.of(store.tier).features.receipts;
  const totalSpent = purchases.reduce((acc, p) => acc.plus(p.totalAmount), new Dec(0)).toFixed(2);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/inventory"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-link-active hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          {t('backToInventory')}
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory/suppliers" className={buttonVariants({ variant: 'secondary' })}>
            <UsersIcon aria-hidden="true" />
            {t('suppliersButton')}
          </Link>
          {!isReadOnly ? (
            <>
              <ReplenishButton />
              <Link href="/inventory/purchases/new" className={buttonVariants()}>
                <PlusIcon aria-hidden="true" />
                {t('newPurchaseButton')}
              </Link>
            </>
          ) : null}
        </div>
      </header>

      {isReadOnly ? (
        <Notice tone="warning">
          <p>{t('readOnlyNotice')}</p>
        </Notice>
      ) : null}

      <dl className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-4">
        <div className="flex flex-col gap-0.5 px-4 py-3">
          <dt className="text-[13px] text-ink-soft">{t('summary.drafts')}</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">{draftOrders.length}</dd>
        </div>
        <div className="flex flex-col gap-0.5 px-4 py-3">
          <dt className="text-[13px] text-ink-soft">{t('summary.purchases')}</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">{purchases.length}</dd>
        </div>
        <div className="flex flex-col gap-0.5 border-t border-line px-4 py-3 sm:border-t-0">
          <dt className="text-[13px] text-ink-soft">{t('summary.totalSpent')}</dt>
          <dd className="text-lg font-semibold text-ink">
            <Money amount={totalSpent} currency="PEN" />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 border-t border-line px-4 py-3 sm:border-t-0">
          <dt className="text-[13px] text-ink-soft">{t('summary.monthlyReceipts')}</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {!hasReceiptsFeature ? (
              <Link
                href="/settings/subscription"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-link-active underline-offset-4 hover:underline"
              >
                <LockIcon aria-hidden="true" className="size-3.5 shrink-0" />
                {t('summary.receiptsLocked')}
              </Link>
            ) : receiptLimit === null ? (
              t('summary.receiptsUnlimited', { count: receiptsThisMonth })
            ) : (
              `${receiptsThisMonth} / ${receiptLimit}`
            )}
          </dd>
        </div>
      </dl>

      {/* Borradores de pedidos de reposición (US17 crit. 5) */}
      <section aria-labelledby="draft-orders-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="draft-orders-heading" className="text-base font-semibold text-ink">
            {t('orders.title')}
          </h2>
          <span className="text-xs text-ink-soft tabular-nums">
            {t('orders.count', { count: draftOrders.length })}
          </span>
        </div>

        {draftOrders.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink-soft">
            {t('orders.empty')}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {draftOrders.map((order) => (
              <li
                key={order.id}
                className="flex flex-col justify-between gap-4 rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">
                        {order.supplierName ?? t('orders.unassignedSupplier')}
                      </span>
                      <span className="text-xs text-ink-soft">{formatDate(order.createdAt)}</span>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-amber/12 px-2.5 py-0.5 text-xs font-medium text-amber-ink">
                      {t('orders.draftBadge')}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-1.5 border-t border-line pt-2 text-sm">
                    {order.items.map((item) => (
                      <li key={item.productId} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-ink">{item.productName}</span>
                          <span className="text-xs text-ink-soft tabular-nums">
                            {t('orders.stockRef', {
                              current: `${formatQuantity(item.currentStock)} ${item.unitCode}`,
                              min: `${formatQuantity(item.minimumStock)} ${item.unitCode}`,
                            })}
                          </span>
                        </div>
                        <span className="shrink-0 font-semibold text-ink tabular-nums">
                          +{formatQuantity(item.quantity)} {item.unitCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {!isReadOnly ? (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                    <DiscardPurchaseOrderButton orderId={order.id} />
                    <Link
                      href={`/inventory/purchases/new?orderId=${order.id}`}
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      <ClipboardListIcon aria-hidden="true" />
                      {t('orders.convertToPurchase')}
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historial de compras (US15) */}
      <section aria-labelledby="purchases-history-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="purchases-history-heading" className="text-base font-semibold text-ink">
            {t('history.title')}
          </h2>
        </div>

        <PurchaseListControls
          suppliers={suppliers}
          activeSupplierId={activeSupplierId ?? ''}
          query={query}
        />

        {purchases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
            <TruckIcon aria-hidden="true" className="size-8 text-ink-soft" />
            <p className="text-sm text-ink-soft">
              {query || activeSupplierId ? t('history.noResults') : t('history.empty')}
            </p>
            {query || activeSupplierId ? (
              <Link
                href="/inventory/purchases"
                className={buttonVariants({ variant: 'secondary' })}
              >
                {t('history.clearFilters')}
              </Link>
            ) : !isReadOnly ? (
              <Link
                href="/inventory/purchases/new"
                className={buttonVariants({ variant: 'secondary' })}
              >
                <PlusIcon aria-hidden="true" />
                {t('newPurchaseButton')}
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {purchases.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/inventory/purchases/${p.id}`}
                  className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-4 transition-[background-color,transform] duration-150 ease-(--ease-out-expo) hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active active:scale-[0.99]"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{p.supplierName}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                        <FileTextIcon aria-hidden="true" className="size-3" />
                        {t(`docTypes.${p.documentType}`)}
                        {p.documentNumber
                          ? ` ${p.series ? `${p.series}-` : ''}${p.documentNumber}`
                          : ''}
                      </span>
                      {p.attachmentsCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-soft px-2.5 py-0.5 text-xs font-medium text-soft-ink">
                          <PaperclipIcon aria-hidden="true" className="size-3" />
                          {p.attachmentsCount}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-ink-soft tabular-nums">
                      {p.issueDate} · {p.userName}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Money amount={p.totalAmount} currency="PEN" />
                    <ChevronRightIcon aria-hidden="true" className="size-5 text-ink-soft" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
