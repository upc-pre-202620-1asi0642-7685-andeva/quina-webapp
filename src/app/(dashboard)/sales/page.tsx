import { getTranslations } from 'next-intl/server';
import { listProducts } from '@/infrastructure/db/queries/catalog';
import { listCounterCustomers } from '@/infrastructure/db/queries/sales';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Counter } from '@/presentation/components/sales/counter';

export default async function SalesPage() {
  const user = await requireStoreUser('/sales', 'sales.create');
  const t = await getTranslations('Sales');
  const [products, customers] = await Promise.all([
    listProducts(user.storeId, '', { activeOnly: true }),
    listCounterCustomers(user.storeId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>
      <Counter products={products} customers={customers} />
    </div>
  );
}
