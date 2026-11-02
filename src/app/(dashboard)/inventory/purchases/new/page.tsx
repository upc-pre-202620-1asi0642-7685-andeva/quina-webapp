import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, PackagePlusIcon } from 'lucide-react';
import { z } from 'zod';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { listProducts } from '@/infrastructure/db/queries/catalog';
import { getDraftPurchaseOrder } from '@/infrastructure/db/queries/purchases';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { requireStoreUser } from '@/presentation/auth/guards';
import { PurchaseForm } from '@/presentation/components/catalog/purchase-form';
import { buttonVariants } from '@/presentation/components/ui/button';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const user = await requireStoreUser('/inventory/purchases/new', 'purchases.manage');
  const t = await getTranslations('Purchases.form');
  const { orderId } = await searchParams;
  const validOrderId = orderId && z.uuid().safeParse(orderId).success ? orderId : null;

  const [suppliers, allProducts, store, draftOrder] = await Promise.all([
    new DrizzlePurchaseRepository().suppliers(user.storeId),
    listProducts(user.storeId),
    loadStoreContext(user.storeId),
    validOrderId ? getDraftPurchaseOrder(user.storeId, validOrderId) : Promise.resolve(null),
  ]);

  const physicalProducts = allProducts
    .filter((p) => !p.isService && p.isActive)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unitCode: p.unitCode,
      currentAverageCost: p.currentAverageCost,
    }));

  const canAttachReceipt = PlanLimits.of(store.tier).features.receipts;
  const defaultDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/inventory/purchases"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('backToPurchases')}
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>

      {physicalProducts.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">{t('noPhysicalProducts')}</p>
          <Link href="/inventory/new" className={buttonVariants()}>
            <PackagePlusIcon aria-hidden="true" />
            {t('createProductFirst')}
          </Link>
        </section>
      ) : (
        <PurchaseForm
          suppliers={suppliers}
          products={physicalProducts}
          initialOrder={
            draftOrder
              ? {
                  id: draftOrder.id,
                  supplierId: draftOrder.supplierId,
                  items: draftOrder.items.map((i) => ({
                    productId: i.productId,
                    suggestedQuantity: i.quantity,
                    unitCost: i.currentAverageCost,
                  })),
                }
              : null
          }
          canAttachReceipt={canAttachReceipt}
          defaultDate={defaultDate}
        />
      )}
    </div>
  );
}
