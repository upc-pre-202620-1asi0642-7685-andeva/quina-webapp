import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, PlusIcon, SearchIcon, StoreIcon } from 'lucide-react';
import { listStores } from '@/infrastructure/db/queries/platform';
import { requirePlatformAdmin } from '@/presentation/auth/guards';
import { StoreStatusBadge } from '@/presentation/components/platform/store-status-badge';
import { buttonVariants } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { formatDate } from '@/presentation/lib/format-date';

export default async function PlatformStoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePlatformAdmin('/platform/stores');
  const t = await getTranslations('Platform.stores');
  const { q = '' } = await searchParams;
  const query = q.slice(0, 60);
  const stores = await listStores(query);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-soft">{t('subtitle', { count: stores.length })}</p>
        </div>
        <Link href="/platform/stores/new" className={buttonVariants()}>
          <PlusIcon aria-hidden="true" />
          {t('newButton')}
        </Link>
      </header>

      <Form role="search" action="" className="flex gap-2">
        <label htmlFor="store-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <Input
          id="store-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="flex-1"
        />
        <button type="submit" className={buttonVariants({ variant: 'secondary', size: 'icon' })}>
          <SearchIcon aria-hidden="true" />
          <span className="sr-only">{t('searchSubmit')}</span>
        </button>
      </Form>

      {stores.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
          <StoreIcon aria-hidden="true" className="size-8 text-ink-soft" />
          {query ? (
            <>
              <p className="text-base text-ink">{t('noResults', { query })}</p>
              <Link href="/platform/stores" className={buttonVariants({ variant: 'secondary' })}>
                {t('clearSearch')}
              </Link>
            </>
          ) : (
            <h2 className="text-lg font-semibold text-ink">{t('emptyTitle')}</h2>
          )}
        </section>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {stores.map((store) => (
            <li key={store.id}>
              <Link
                href={`/platform/stores/${store.id}`}
                className="flex items-center gap-4 px-4 py-4 hover:bg-surface-hover sm:px-6"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-medium text-ink">{store.name}</p>
                  <p className="truncate text-sm text-ink-soft tabular-nums">
                    {store.taxIdType} {store.taxId} · {store.email}
                  </p>
                </div>
                <div className="hidden flex-col items-end gap-1 sm:flex">
                  <StoreStatusBadge active={store.isActive} />
                  <span className="text-[13px] text-ink-soft">
                    {t('since', { date: formatDate(store.createdAt) })}
                  </span>
                </div>
                <span className="sm:hidden">
                  <StoreStatusBadge active={store.isActive} />
                </span>
                <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
