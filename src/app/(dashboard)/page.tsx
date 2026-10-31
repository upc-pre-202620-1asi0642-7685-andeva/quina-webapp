import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { UserPlusIcon } from 'lucide-react';
import { can } from '@/core/domain/identity/permissions';
import { requireStoreUser } from '@/presentation/auth/guards';
import { buttonVariants } from '@/presentation/components/ui/button';
import { formatDate } from '@/presentation/lib/format-date';
import { loadStoreContext } from '@/presentation/queries/store-context';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardHomePage() {
  const user = await requireStoreUser('/');
  const t = await getTranslations('Dashboard');
  const store = await loadStoreContext(user.storeId);
  // US24: la prueba Pro se ve desde el primer día, también en el celular
  const trialEndsAt =
    store.subscription.status === 'TRIALING' && store.tier !== 'CASERO'
      ? store.subscription.trialEndsAt
      : null;
  const now = new Date().getTime();
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
