import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getProduct } from '@/infrastructure/db/queries/catalog';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { updateProductAction } from '@/presentation/actions/catalog';
import { requireStoreUser } from '@/presentation/auth/guards';
import { ProductForm } from '@/presentation/components/catalog/product-form';
import { formatQuantity } from '@/presentation/lib/format-quantity';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStoreUser(`/inventory/${id}/edit`, 'catalog.manage');
  if (!z.uuid().safeParse(id).success) notFound();
  const [product, units, suppliers] = await Promise.all([
    getProduct(user.storeId, id),
    new DrizzleProductRepository().units(user.storeId),
    new DrizzlePurchaseRepository().suppliers(user.storeId),
  ]);
  if (!product) notFound();
  const t = await getTranslations('Inventory');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={`/inventory/${id}`}
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('detail.back')}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {t('form.editTitle', { name: product.name })}
        </h1>
        <p className="text-sm text-ink-soft">{t('form.editSubtitle')}</p>
      </header>
      <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
        <ProductForm
          mode="edit"
          action={updateProductAction.bind(null, id)}
          units={units}
          suppliers={suppliers}
          cancelHref={`/inventory/${id}`}
          initial={{
            name: product.name,
            description: product.description ?? '',
            brand: product.brand ?? '',
            sku: product.sku ?? '',
            barcode: product.barcode ?? '',
            unitId: product.unitId,
            defaultSupplierId: product.defaultSupplierId ?? '',
            isService: product.isService,
            allowsInstallments: product.allowsInstallments,
            cashPrice: product.cashPrice,
            creditPrice: product.creditPrice,
            minimumStock: formatQuantity(product.minimumStock),
            initialStock: '',
            imageUrl: product.imageUrl,
          }}
        />
      </section>
    </div>
  );
}
