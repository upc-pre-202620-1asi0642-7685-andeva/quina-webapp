import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleUserRoundIcon } from 'lucide-react';
import { AppToaster } from '@/presentation/components/feedback/app-toaster';
import { OfflineBanner } from '@/presentation/components/pwa/pwa';
import isologo from '../../../../public/brand/quina-isologo-verde.svg';

const press =
  'transition-[transform,color,background-color] duration-150 ease-(--ease-out-expo) active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100';

/**
 * Marco del portal del vecino (US14, DESIGN.md §6.2): una sola columna, sin la
 * navegación del comerciante y con la escala grande de Doña Rosa (P8).
 */
export async function PortalShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('Portal.shell');
  return (
    <div className="min-h-dvh bg-paper print:bg-white">
      <header className="portal-chrome sticky top-0 z-30 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/85 print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-4 px-4">
          <Link
            href="/portal"
            aria-label={t('home')}
            className={`flex min-h-11 items-center rounded-full pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active ${press}`}
          >
            <Image src={isologo} alt={t('logoAlt')} priority className="h-8 w-auto" />
          </Link>
          <Link
            href="/portal/profile"
            className={`flex min-h-11 items-center gap-2 rounded-full px-3.5 text-base font-medium text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active ${press}`}
          >
            <CircleUserRoundIcon aria-hidden="true" className="size-6 text-ink-soft" />
            <span>{t('profile')}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-[max(4rem,calc(2.5rem+env(safe-area-inset-bottom,0px)))] text-lg leading-relaxed print:max-w-none print:p-0">
        <OfflineBanner />
        {children}
      </main>
      <AppToaster />
    </div>
  );
}
