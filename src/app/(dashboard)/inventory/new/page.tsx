import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { createProductAction } from '@/presentation/actions/catalog';
import { requireStoreUser } from '@/presentation/auth/guards';
import { ProductForm } from '@/presentation/components/catalog/product-form';

export default async function NewProductPage() {
  const user = await requireStoreUser('/inventory/new', 'catalog.manage');
  const t = await getTranslations('Inventory');
  const units = await new DrizzleProductRepository().units(user.storeId);
  const defaultUnit = units.find((u) => u.code === 'UND') ?? units[0];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('detail.back')}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('form.newTitle')}</h1>
        <p className="text-sm text-ink-soft">{t('form.newSubtitle')}</p>
      </header>
      <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
        <ProductForm
          mode="new"
          action={createProductAction}
          units={units}
          cancelHref="/inventory"
          initial={{
            name: '',
            description: '',
            brand: '',
            sku: '',
            barcode: '',
            unitId: defaultUnit?.id ?? '',
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
    </div>
  );
}
