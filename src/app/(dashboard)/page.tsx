import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { UserPlusIcon } from 'lucide-react';
import { can } from '@/core/domain/identity/permissions';
import { requireStoreUser } from '@/presentation/auth/guards';
import { buttonVariants } from '@/presentation/components/ui/button';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function DashboardHomePage() {
  const user = await requireStoreUser('/');
  const t = await getTranslations('Dashboard');
  const store = await loadStoreContext(user.storeId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{store.name}</h1>
        <p className="text-base text-ink">{t('welcome', { name: user.name })}</p>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
        {can(user.role, 'customers.create') ? (
          <Link href="/customers/new" className={buttonVariants({ className: 'mt-2 self-start' })}>
            <UserPlusIcon aria-hidden="true" />
            {t('registerCustomer')}
          </Link>
        ) : null}
      </section>
    </div>
  );
}
