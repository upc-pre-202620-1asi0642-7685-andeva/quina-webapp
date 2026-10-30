import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import isologo from '../../public/brand/quina-isologo-verde.svg';

// Marcador de posición hasta el registro y el inicio de sesión (plan 0, siguiente parte).
export default async function HomePage() {
  const t = await getTranslations('Home');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-4 py-12">
      <Image src={isologo} alt={t('logoAlt')} priority className="h-10 w-auto" />
      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <span className="self-start rounded-full bg-paper-deep px-3 py-1 text-sm font-medium text-ink-soft">
          {t('status')}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-base text-ink-soft">{t('lead')}</p>
      </section>
    </main>
  );
}
