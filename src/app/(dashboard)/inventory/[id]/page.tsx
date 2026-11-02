import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, LockIcon, PackageIcon, PencilIcon } from 'lucide-react';
import { z } from 'zod';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { Quantity } from '@/core/domain/catalog/quantity';
import { can } from '@/core/domain/identity/permissions';
import { getProduct } from '@/infrastructure/db/queries/catalog';
import { requireStoreUser } from '@/presentation/auth/guards';
import { ProductActions } from '@/presentation/components/catalog/product-actions';
import {
  ProductStatusBadge,
  productStatus,
} from '@/presentation/components/catalog/product-status-badge';
import { formatMoney, Money } from '@/presentation/components/money';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { formatQuantity } from '@/presentation/lib/format-quantity';
import { loadStoreContext } from '@/presentation/queries/store-context';

const NOTICES = ['created', 'saved', 'stockAdjusted', 'wasteRecorded'] as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const user = await requireStoreUser(`/inventory/${id}`, 'stock.read');
  if (!z.uuid().safeParse(id).success) notFound();
  const [product, store] = await Promise.all([
    getProduct(user.storeId, id),
    loadStoreContext(user.storeId),
  ]);
  if (!product) notFound();

  const t = await getTranslations('Inventory.detail');
  const tPlans = await getTranslations('Plans');
  const { notice } = await searchParams;
  const shownNotice = NOTICES.find((n) => n === notice);
  const canManage = can(user.role, 'catalog.manage');
  const hasKardexCost = PlanLimits.of(store.tier).features.kardexAverageCost;
  const quantity = (value: string) => `${formatQuantity(value)} ${product.unitCode}`;
  const signedQuantity = (value: string) => {
    const sign = value.startsWith('-') ? '' : '+';
    return `${sign}${formatQuantity(value)} ${product.unitCode}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('back')}
      </Link>

      {shownNotice ? (
        <Notice tone="success">
          <p>{t(shownNotice, { name: product.name })}</p>
        </Notice>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público, sin optimizador
            <img
              src={product.imageUrl}
              alt={t('imageAlt', { name: product.name })}
              className="size-20 shrink-0 rounded-card border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-20 shrink-0 items-center justify-center rounded-card bg-paper-deep text-ink-soft"
            >
              <PackageIcon className="size-8" />
            </span>
          )}
          <div className="flex flex-col items-start gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{product.name}</h1>
            <ProductStatusBadge status={productStatus(product)} />
          </div>
        </div>
        {canManage ? (
          <Link href={`/inventory/${id}/edit`} className={buttonVariants({ variant: 'secondary' })}>
            <PencilIcon aria-hidden="true" />
            {t('edit')}
          </Link>
        ) : null}
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('pricesTitle')}</h2>
        <dl className="grid grid-cols-2 gap-3">
          <Figure label={t('cashPrice')}>
            <Money amount={product.cashPrice} currency="PEN" />
          </Figure>
          <Figure label={t('creditPrice')}>
            <Money amount={product.creditPrice} currency="PEN" />
          </Figure>
        </dl>

        <h2 className="pt-2 text-lg font-semibold text-ink">{t('stockTitle')}</h2>
        {product.isService ? (
          <p className="text-sm text-ink-soft">{t('serviceNoStock')}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label={t('currentStock')}>
              <span className="tabular-nums">{quantity(product.currentStock)}</span>
            </Figure>
            <Figure label={t('minimumStock')}>
              <span className="tabular-nums">{quantity(product.minimumStock)}</span>
            </Figure>
            {canManage ? (
              hasKardexCost ? (
                <>
                  <Figure label={t('averageCost')}>
                    <span className="tabular-nums">S/ {product.currentAverageCost}</span>
                  </Figure>
                  <Figure label={t('stockValue')}>
                    <Money
                      amount={Quantity.valuedAt(product.currentStock, product.currentAverageCost)}
                      currency="PEN"
                    />
                  </Figure>
                </>
              ) : (
                <div className="col-span-2 flex items-center justify-between gap-3 rounded-field bg-paper-deep p-3 text-sm text-ink-soft">
                  <span className="flex items-center gap-2">
                    <LockIcon aria-hidden="true" className="size-4 shrink-0" />
                    {tPlans('features.kardexAverageCost')}
                  </span>
                  <Link
                    href="/settings#plans"
                    className="font-semibold text-link-active underline underline-offset-4"
                  >
                    {tPlans('seePlans')}
                  </Link>
                </div>
              )
            ) : null}
          </dl>
        )}

        {canManage ? (
          <ProductActions
            productId={id}
            name={product.name}
            isActive={product.isActive}
            isService={product.isService}
            unitCode={product.unitCode}
            allowDecimals={product.allowDecimals}
          />
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('detailsTitle')}</h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Row label={t('brand')} value={product.brand ?? t('none')} />
          <Row label={t('unit')} value={`${product.unitCode} · ${product.unitName}`} />
          <Row label={t('barcode')} value={product.barcode ?? t('none')} />
          <Row label={t('sku')} value={product.sku ?? t('none')} />
          {!product.isService ? (
            <Row label={t('defaultSupplier')} value={product.defaultSupplierName ?? t('none')} />
          ) : null}
          <Row
            label={t('installments')}
            value={product.allowsInstallments ? t('installmentsYes') : t('installmentsNo')}
          />
          {product.description ? (
            <div className="flex flex-col gap-0.5 sm:col-span-2">
              <dt className="text-[13px] text-ink-soft">{t('description')}</dt>
              <dd className="whitespace-pre-line text-ink">{product.description}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {!product.isService && canManage ? (
        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-ink">{t('kardexTitle')}</h2>
            <p className="text-[13px] text-ink-soft">{t('kardexSubtitle')}</p>
          </div>
          {product.movements.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('kardexEmpty')}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line">
              {product.movements.map((mov) => (
                <li key={mov.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {t(`movementTypes.${mov.movementType}`)}
                    </span>
                    <span className="text-sm font-semibold text-ink tabular-nums">
                      {signedQuantity(mov.quantity)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-soft">
                    <span>
                      {formatDate(mov.createdAt)} · {mov.userName}
                    </span>
                    <span className="tabular-nums">
                      {t('kardexStockAfter', { stock: quantity(mov.stockAfter) })}
                      {hasKardexCost
                        ? ` · ${t('kardexAvgAfter', { cost: `S/ ${mov.averageCostAfter}` })}`
                        : ''}
                    </span>
                  </div>
                  {mov.notes ? <p className="text-sm text-ink-soft">{mov.notes}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('historyTitle')}</h2>
        {product.priceHistory.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('historyEmpty')}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {product.priceHistory.map((change) => (
              <li key={change.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="text-[13px] text-ink-soft">
                  {t('historyChange', {
                    date: formatDate(change.createdAt),
                    user: change.userName,
                  })}
                </p>
                {change.oldCashPrice !== change.newCashPrice ? (
                  <p className="text-sm text-ink tabular-nums">
                    {t('historyCash', {
                      old: formatMoney(change.oldCashPrice, 'PEN'),
                      new: formatMoney(change.newCashPrice, 'PEN'),
                    })}
                  </p>
                ) : null}
                {change.oldCreditPrice !== change.newCreditPrice ? (
                  <p className="text-sm text-ink tabular-nums">
                    {t('historyCredit', {
                      old: formatMoney(change.oldCreditPrice, 'PEN'),
                      new: formatMoney(change.newCreditPrice, 'PEN'),
                    })}
                  </p>
                ) : null}
                {change.reason ? <p className="text-sm text-ink-soft">{change.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-field bg-paper-deep p-3">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className="text-lg font-semibold whitespace-nowrap text-ink">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className="break-words text-ink tabular-nums">{value}</dd>
    </div>
  );
}
