import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CUSTOMER_PRIVACY_VERSION } from '@/core/domain/credit/customer-consent';
import { db } from '@/infrastructure/db/connection';
import { stores } from '@/infrastructure/db/schema';

export const metadata = { robots: { index: false } };

// Política adaptada al comercio (US04.2, D7): la tienda es la titular y Quina el encargado
export default async function CustomerPrivacyPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  if (!z.uuid().safeParse(storeId).success) notFound();
  const [store] = await db
    .select({
      name: stores.commercialName,
      taxIdType: stores.taxIdType,
      taxId: stores.taxIdNumber,
      email: stores.contactEmail,
      address: stores.address,
    })
    .from(stores)
    .where(eq(stores.id, storeId));
  if (!store) notFound();

  const t = await getTranslations('Privacy.customers');
  const sections = [
    ['ownerTitle', 'owner'],
    ['processorTitle', 'processor'],
    ['dataTitle', 'data'],
    ['purposeTitle', 'purpose'],
    ['retentionTitle', 'retention'],
    ['rightsTitle', 'rights'],
  ] as const;
  const values = {
    store: store.name,
    taxIdType: store.taxIdType,
    taxId: store.taxId,
    email: store.email,
  };

  return (
    <main className="min-h-dvh bg-paper px-4 py-10 sm:py-16">
      <article className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-soft">
            {t('version', { version: CUSTOMER_PRIVACY_VERSION })}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">
            {t('title', { store: store.name })}
          </h1>
          <p className="rounded-field border border-line bg-paper-deep px-3 py-2 text-sm text-ink-soft">
            {t('draft')}
          </p>
          <p className="text-base leading-relaxed text-ink">{t('intro', { store: store.name })}</p>
        </header>
        {sections.map(([title, body]) => (
          <section key={title} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ink">{t(title)}</h2>
            <p className="text-base leading-relaxed text-ink">{t(body, values)}</p>
            {body === 'owner' && store.address ? (
              <p className="text-base leading-relaxed text-ink">
                {t('ownerAddress', { address: store.address })}
              </p>
            ) : null}
          </section>
        ))}
      </article>
    </main>
  );
}
