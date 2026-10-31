import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { registerCustomerAction } from '@/presentation/actions/customers';
import { requireStoreUser } from '@/presentation/auth/guards';
import { CustomerForm } from '@/presentation/components/customers/customer-form';
import { loadStoreContext } from '@/presentation/queries/store-context';

export default async function NewCustomerPage() {
  const user = await requireStoreUser('/customers/new', 'customers.create');
  const store = await loadStoreContext(user.storeId);
  const t = await getTranslations('Customers');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/customers"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('detail.back')}
      </Link>
      <header className="flex flex-col gap-1">
        {user.role === 'STORE_OWNER' ? (
          <p className="text-[13px] font-medium text-ink-soft">{t('form.newStep')}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('form.newTitle')}</h1>
        <p className="text-sm text-ink-soft">{t('form.newSubtitle')}</p>
      </header>
      <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
        <CustomerForm
          mode="new"
          action={registerCustomerAction}
          storeName={store.name}
          privacyHref={`/app/privacy/customers/${user.storeId}`}
          cancelHref="/customers"
        />
      </section>
    </div>
  );
}
