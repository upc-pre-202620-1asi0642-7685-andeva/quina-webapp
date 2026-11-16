import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, TruckIcon } from 'lucide-react';
import { listSuppliersWithStats } from '@/infrastructure/db/queries/purchases';
import { requireStoreUser } from '@/presentation/auth/guards';
import { NewSupplierButton } from '@/presentation/components/catalog/new-supplier-button';
import { SuppliersDirectory } from '@/presentation/components/catalog/suppliers-directory';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Notice } from '@/presentation/components/notice';
import { loadStoreContext } from '@/presentation/queries/store-context';

/** Proveedores de la tienda: directorio, alta, edición y baja/reactivación. */
export default async function SuppliersPage() {
  const user = await requireStoreUser('/inventory/suppliers', 'purchases.manage');
  const t = await getTranslations('Suppliers');
  const [suppliers, store] = await Promise.all([
    listSuppliersWithStats(user.storeId),
    loadStoreContext(user.storeId),
  ]);

  const isReadOnly = store.isReadOnly;

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
          <Link href="/inventory/purchases" className={buttonVariants({ variant: 'secondary' })}>
            <TruckIcon aria-hidden="true" />
            {t('purchasesButton')}
          </Link>
          {!isReadOnly ? <NewSupplierButton label={t('newButton')} /> : null}
        </div>
      </header>

      {isReadOnly ? (
        <Notice tone="warning">
          <p>{t('readOnlyNotice')}</p>
        </Notice>
      ) : null}

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <TruckIcon aria-hidden="true" className="size-8 text-ink-soft" />
          <p className="max-w-sm text-sm text-ink-soft">{t('empty')}</p>
        </div>
      ) : (
        <SuppliersDirectory suppliers={suppliers} isReadOnly={isReadOnly} />
      )}
    </div>
  );
}
