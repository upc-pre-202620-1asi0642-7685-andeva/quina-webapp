import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';
import { getStore } from '@/infrastructure/db/queries/platform';
import { requirePlatformAdmin } from '@/presentation/auth/guards';
import { Notice } from '@/presentation/components/notice';
import { StoreActions } from '@/presentation/components/platform/store-actions';
import { StoreStatusBadge } from '@/presentation/components/platform/store-status-badge';
import { formatDate } from '@/presentation/lib/format-date';

export default async function PlatformStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  await requirePlatformAdmin(`/platform/stores/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const store = await getStore(id);
  if (!store) notFound();

  const t = await getTranslations('Platform.detail');
  const tPlans = await getTranslations('Plans');
  const tTurns = await getTranslations('Register.store.turns');
  const { notice } = await searchParams;
  const ownerPending = store.owner !== null && !store.owner.hasPassword;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/platform/stores"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-link-active hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('back')}
      </Link>

      {notice === 'created' || notice === 'createdNoMail' ? (
        <Notice tone={notice === 'created' ? 'success' : 'warning'}>
          <p>{t(notice, { email: store.owner?.email ?? store.email })}</p>
        </Notice>
      ) : null}

      <header className="flex flex-col items-start gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{store.name}</h1>
        <StoreStatusBadge active={store.isActive} />
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Row label={t('taxId')} value={`${store.taxIdType} ${store.taxId}`} />
          <Row label={t('businessTurn')} value={tTurns(store.businessTurn as 'BODEGA')} />
          <Row label={t('owner')} value={`${store.ownerName} · ${store.email}`} />
          <Row
            label={t('ownerAccess')}
            value={
              store.owner === null
                ? t('ownerMissing')
                : ownerPending
                  ? t('ownerPending')
                  : t('ownerReady')
            }
          />
          <Row
            label={t('plan')}
            value={
              store.planTier
                ? store.status === 'TRIALING' && store.trialEndsAt
                  ? t('planTrial', {
                      plan: tPlans(`names.${store.planTier}`),
                      date: formatDate(store.trialEndsAt),
                    })
                  : tPlans(`names.${store.planTier}`)
                : '—'
            }
          />
          <Row label={t('since')} value={formatDate(store.createdAt)} />
        </dl>
        <StoreActions
          storeId={store.id}
          name={store.name}
          isActive={store.isActive}
          ownerPending={ownerPending}
        />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-ink-soft">{label}</dt>
      <dd className="break-words text-ink tabular-nums">{value}</dd>
    </div>
  );
}
