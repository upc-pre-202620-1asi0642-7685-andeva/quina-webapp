import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { can } from '@/core/domain/identity/permissions';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { createProductAction } from '@/presentation/actions/catalog';
import { requireStoreUser } from '@/presentation/auth/guards';
import { ProductForm } from '@/presentation/components/catalog/product-form';
import { Notice } from '@/presentation/components/notice';
import { buttonVariants } from '@/presentation/components/ui/button';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function NewProductPage() {
  const user = await requireStoreUser('/inventory/new', 'catalog.manage');
  const t = await getTranslations('Inventory');
  const [units, suppliers, store] = await Promise.all([
    new DrizzleProductRepository().units(user.storeId),
    new DrizzlePurchaseRepository().suppliers(user.storeId),
    loadStoreContext(user.storeId),
  ]);
  const defaultUnit = units.find((u) => u.code === 'UND') ?? units[0];
  const activeSuppliers = suppliers.filter((s) => s.isActive);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/inventory"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('detail.back')}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('form.newTitle')}</h1>
        <p className="text-sm text-ink-soft">{t('form.newSubtitle')}</p>
      </header>
      {store.isReadOnly ? (
        <Notice tone="warning">
          <p>{t('list.readOnlyNotice')}</p>
          <Link
            href="/settings/subscription"
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            {t('form.seePlans')}
          </Link>
        </Notice>
      ) : (
        <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
          <ProductForm
            mode="new"
            action={createProductAction}
            units={units}
            suppliers={activeSuppliers}
            canCreateSupplier={can(user.role, 'purchases.manage')}
            cancelHref="/inventory"
            initial={{
              name: '',
              description: '',
              brand: '',
              sku: '',
              barcode: '',
              unitId: defaultUnit?.id ?? '',
              defaultSupplierId: '',
              isService: false,
              allowsInstallments: false,
              cashPrice: '',
              creditPrice: '',
              minimumStock: '',
              initialStock: '',
              imageUrl: null,
            }}
          />
        </section>
      )}
    </div>
  );
}
