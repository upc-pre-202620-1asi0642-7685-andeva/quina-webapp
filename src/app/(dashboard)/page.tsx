import Image from 'next/image';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { stores, storeSubscriptions } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { requireOwner } from '@/presentation/auth/session';
import { formatDate } from '@/presentation/lib/format-date';
import isologo from '../../../public/brand/quina-isologo-verde.svg';

export default async function DashboardHomePage() {
  const user = await requireOwner();
  const t = await getTranslations('Dashboard');

  const data = await withTenant(user.storeId, async (tx) => {
    const [store] = await tx
      .select({ commercialName: stores.commercialName })
      .from(stores)
      .where(eq(stores.id, user.storeId));
    const [sub] = await tx
      .select({ trialEndsAt: storeSubscriptions.trialEndsAt })
      .from(storeSubscriptions)
      .where(eq(storeSubscriptions.storeId, user.storeId));
    return { store, sub };
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <Image src={isologo} alt={t('logoAlt')} priority className="h-9 w-auto" />
        <Link
          href="/profile"
          className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover"
        >
          {t('profileLink')}
        </Link>
      </header>
      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-soft px-3 py-1 text-sm font-medium text-soft-ink">
            {t('trialBadge')}
          </span>
          {data.sub?.trialEndsAt ? (
            <span className="text-sm text-ink-soft tabular-nums">
              {t('trialUntil', { date: formatDate(data.sub.trialEndsAt) })}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {data.store?.commercialName}
        </h1>
        <p className="text-base text-ink">{t('welcome', { name: user.name })}</p>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </section>
    </main>
  );
}
