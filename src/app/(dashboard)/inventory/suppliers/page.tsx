import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, PhoneIcon, TruckIcon } from 'lucide-react';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { requireStoreUser } from '@/presentation/auth/guards';
import { NewSupplierButton } from '@/presentation/components/catalog/new-supplier-button';

/** Proveedores de la tienda: lista y alta, sin entrar a Nueva compra. */
export default async function SuppliersPage() {
  const user = await requireStoreUser('/inventory/suppliers', 'purchases.manage');
  const t = await getTranslations('Suppliers');
  const suppliers = await new DrizzlePurchaseRepository().suppliers(user.storeId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </div>
        <NewSupplierButton label={t('newButton')} />
      </header>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <TruckIcon aria-hidden="true" className="size-8 text-ink-soft" />
          <p className="max-w-sm text-sm text-ink-soft">{t('empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/inventory/purchases?supplierId=${supplier.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover sm:px-6"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-sm font-semibold text-ink"
                >
                  {supplier.tradeName.trim().charAt(0).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{supplier.tradeName}</span>
                    {supplier.isActive ? null : (
                      <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink-soft">
                        {t('inactive')}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-ink-soft tabular-nums">
                    <span>
                      {t('taxId')} {supplier.taxIdNumber}
                    </span>
                    {supplier.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <PhoneIcon aria-hidden="true" className="size-3" />
                        {supplier.phone}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="hidden text-xs font-medium text-link-active sm:inline">
                  {t('seePurchases')}
                </span>
                <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
