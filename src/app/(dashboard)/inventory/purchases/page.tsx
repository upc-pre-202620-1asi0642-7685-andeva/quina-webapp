import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FileTextIcon,
  PaperclipIcon,
  PlusIcon,
  TruckIcon,
} from 'lucide-react';
import { listDraftPurchaseOrders, listPurchases } from '@/infrastructure/db/queries/purchases';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { requireStoreUser } from '@/presentation/auth/guards';
import {
  DiscardPurchaseOrderButton,
  ReplenishButton,
} from '@/presentation/components/catalog/replenish-button';
import { Money } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { formatQuantity } from '@/presentation/lib/format-quantity';

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const user = await requireStoreUser('/inventory/purchases', 'purchases.manage');
  const t = await getTranslations('Purchases');
  const { supplierId } = await searchParams;
  const activeSupplierId = supplierId && supplierId.length > 0 ? supplierId : undefined;

  const [purchases, draftOrders, suppliers] = await Promise.all([
    listPurchases(user.storeId, activeSupplierId),
    listDraftPurchaseOrders(user.storeId),
    new DrizzlePurchaseRepository().suppliers(user.storeId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
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
          <ReplenishButton />
          <Link href="/inventory/purchases/new" className={buttonVariants()}>
            <PlusIcon aria-hidden="true" />
            {t('newPurchaseButton')}
          </Link>
        </div>
      </header>

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

                  <ul className="flex flex-col gap-1 border-t border-line pt-2 text-sm">
                    {order.items.map((item) => (
                      <li key={item.productId} className="flex items-center justify-between gap-2">
                        <span className="truncate text-ink">{item.productName}</span>
                        <span className="shrink-0 font-medium text-ink tabular-nums">
                          +{formatQuantity(item.quantity)} {item.unitCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                  <DiscardPurchaseOrderButton orderId={order.id} />
                  <Link
                    href={`/inventory/purchases/new?orderId=${order.id}`}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    <ClipboardListIcon aria-hidden="true" />
                    {t('orders.convertToPurchase')}
                  </Link>
                </div>
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

          {suppliers.length > 0 ? (
            <Form action="/inventory/purchases" className="flex items-center gap-2">
              <label htmlFor="supplier-filter" className="text-xs text-ink-soft">
                {t('history.filterSupplier')}
              </label>
              <select
                id="supplier-filter"
                name="supplierId"
                defaultValue={activeSupplierId ?? ''}
                className="h-9 rounded-field border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t('history.allSuppliers')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.tradeName}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                {t('history.applyFilter')}
              </button>
            </Form>
          ) : null}
        </div>

        {purchases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
            <TruckIcon aria-hidden="true" className="size-8 text-ink-soft" />
            <p className="text-sm text-ink-soft">{t('history.empty')}</p>
            <Link
              href="/inventory/purchases/new"
              className={buttonVariants({ variant: 'secondary' })}
            >
              <PlusIcon aria-hidden="true" />
              {t('newPurchaseButton')}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {purchases.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/inventory/purchases/${p.id}`}
                  className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-4 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-link-active"
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
                    <span className="text-xs text-ink-soft">
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
