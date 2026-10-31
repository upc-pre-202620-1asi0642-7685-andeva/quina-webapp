import { getTranslations } from 'next-intl/server';
import { requirePlatformAdmin } from '@/presentation/auth/guards';
import { CreateStoreForm } from '@/presentation/components/platform/create-store-form';

export default async function NewStorePage() {
  await requirePlatformAdmin('/platform/stores/new');
  const t = await getTranslations('Platform.create');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </header>
      <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
        <CreateStoreForm />
      </section>
    </div>
  );
}
