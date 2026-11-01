import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleUserRoundIcon } from 'lucide-react';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';

/**
 * Marco del portal del vecino (US14, DESIGN.md §6.2): una sola columna, sin la
 * navegación del comerciante y con la escala grande de Doña Rosa (P8).
 */
export async function PortalShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('Portal.shell');
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-4 px-4">
          <Link href="/portal" aria-label={t('home')} className="flex min-h-11 items-center">
            <Image src={isologo} alt={t('logoAlt')} priority className="h-8 w-auto" />
          </Link>
          <Link
            href="/portal/profile"
            className="flex min-h-11 items-center gap-2 rounded-full px-3 text-base font-medium text-ink hover:bg-surface-hover"
          >
            <CircleUserRoundIcon aria-hidden="true" className="size-6 text-ink-soft" />
            {t('profile')}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-16 text-lg leading-relaxed">
        {children}
      </main>
    </div>
  );
}
