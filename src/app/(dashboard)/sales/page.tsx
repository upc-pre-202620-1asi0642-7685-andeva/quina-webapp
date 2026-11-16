import { getTranslations } from 'next-intl/server';
import { can } from '@/core/domain/identity/permissions';
import { listProducts } from '@/infrastructure/db/queries/catalog';
import { loadTopProducts } from '@/infrastructure/db/queries/dashboard-analytics';
import { listCounterCustomers, loadTodayCounterSales } from '@/infrastructure/db/queries/sales';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Counter } from '@/presentation/components/sales/counter';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const user = await requireStoreUser('/sales', 'sales.create');
  const t = await getTranslations('Sales');
  const { customerId } = await searchParams;
  const now = new Date();
  const [products, customers, topProducts, todaySummary] = await Promise.all([
    listProducts(user.storeId, '', { activeOnly: true }),
    listCounterCustomers(user.storeId),
    loadTopProducts(user.storeId, now, 30, 12),
    loadTodayCounterSales(user.storeId, now),
  ]);

  return (
    <Counter
      products={products}
      customers={customers}
      initialCustomerId={customerId ?? null}
      topProductIds={topProducts.map((p) => p.productId)}
      todaySummary={todaySummary}
      canManageCatalog={can(user.role, 'catalog.manage')}
      canCreateCustomer={can(user.role, 'customers.create')}
      heading={
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        </header>
      }
    />
  );
}
