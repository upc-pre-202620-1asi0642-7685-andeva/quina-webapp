import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  AlertTriangleIcon,
  PackageIcon,
  ShieldCheckIcon,
  ShoppingBasketIcon,
  UserPlusIcon,
} from 'lucide-react';
import { can } from '@/core/domain/identity/permissions';
import { countLowStockProducts } from '@/infrastructure/db/queries/catalog';
import { loadTodayCashBox } from '@/infrastructure/db/queries/sales';
import { requireStoreUser } from '@/presentation/auth/guards';
import { Money } from '@/presentation/components/money';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { loadStoreContext } from '@/presentation/queries/store-context';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardHomePage() {
  const user = await requireStoreUser('/');
  const t = await getTranslations('Dashboard');
  const [store, lowStockCount] = await Promise.all([
    loadStoreContext(user.storeId),
    countLowStockProducts(user.storeId),
  ]);
  // US24: la prueba Pro se ve desde el primer día, también en el celular
  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;
  const today = new Date();
  const now = today.getTime();
  // D6: la caja de hoy es del dueño; el empleado no ve totales del negocio
  const cashBox = can(user.role, 'reports.view')
    ? await loadTodayCashBox(user.storeId, today)
    : null;
  const trialDays = trialEndsAt
    ? Math.max(1, Math.ceil((trialEndsAt.getTime() - now) / DAY_MS))
    : null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
        {trialEndsAt && trialDays ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-soft px-3 py-1 text-sm font-medium text-soft-ink">
              {t('trialBadge', { days: trialDays })}
            </span>
            <span className="text-sm text-ink-soft tabular-nums">
              {t('trialUntil', { date: formatDate(trialEndsAt) })}
            </span>
          </div>
        ) : null}
        {lowStockCount > 0 ? (
          <div>
            <Link
              href="/inventory?filter=low"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber/12 px-3 py-1 text-xs font-medium text-amber-ink hover:opacity-90"
            >
              <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
              {t('lowStockBanner', { count: lowStockCount })}
            </Link>
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{store.name}</h1>
        <p className="text-base text-ink">{t('welcome', { name: user.name })}</p>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {can(user.role, 'sales.create') ? (
            <Link href="/sales" className={buttonVariants()}>
              <ShoppingBasketIcon aria-hidden="true" />
              {t('sellLink')}
            </Link>
          ) : null}
          {can(user.role, 'customers.create') ? (
            <Link href="/customers/new" className={buttonVariants({ variant: 'secondary' })}>
              <UserPlusIcon aria-hidden="true" />
              {t('registerCustomer')}
            </Link>
          ) : null}
          {/* En el celular el inventario no cabe en la barra inferior (DESIGN.md §5) */}
          {can(user.role, 'stock.read') ? (
            <Link href="/inventory" className={buttonVariants({ variant: 'secondary' })}>
              <PackageIcon aria-hidden="true" />
              {t('inventoryLink')}
            </Link>
          ) : null}
          {can(user.role, 'settings.billing') ? (
            <Link href="/audit" className={buttonVariants({ variant: 'secondary' })}>
              <ShieldCheckIcon aria-hidden="true" />
              {t('auditLink')}
            </Link>
          ) : null}
        </div>
      </section>

      {cashBox ? (
        <section
          aria-labelledby="cash-box-title"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="cash-box-title" className="text-lg font-semibold text-ink">
              {t('cashBox.title')}
            </h2>
            <span className="text-sm text-ink-soft tabular-nums">
              {t('cashBox.count', { count: cashBox.count })}
            </span>
          </div>
          <Money
            amount={cashBox.total}
            currency="PEN"
            className="text-3xl font-semibold text-ink"
          />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cashBox.byMethod.map((row) => (
              <div
                key={row.method}
                className="flex flex-col gap-0.5 rounded-field bg-paper-deep px-3 py-2"
              >
                <dt className="text-[13px] text-ink-soft">{t(`cashBox.methods.${row.method}`)}</dt>
                <dd>
                  <Money
                    amount={row.total}
                    currency="PEN"
                    className="text-base font-semibold text-ink"
                  />
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] text-ink-soft">{t('cashBox.hint')}</p>
        </section>
      ) : null}
    </div>
  );
}
