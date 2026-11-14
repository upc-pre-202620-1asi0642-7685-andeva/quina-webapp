import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PackageIcon, UsersIcon, WifiOffIcon } from 'lucide-react';
import { buttonVariants } from '@/presentation/components/ui/button';
import isologo from '../../../public/brand/quina-isologo-verde.svg';

/**
 * US22 crit. 4: lo que muestra el service worker cuando no hay señal y la página
 * pedida no está guardada. Es pública (sin sesión) para poder precargarla.
 */
export default async function OfflinePage() {
  const t = await getTranslations('Offline');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 bg-paper px-4 py-10 text-center">
      <Image src={isologo} alt="Quina" className="h-8 w-auto" />
      <WifiOffIcon aria-hidden="true" className="size-10 text-ink-soft" />
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
      <p className="text-base text-ink">{t('body')}</p>
      <p className="text-sm text-ink-soft">{t('writes')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/inventory" className={buttonVariants({ variant: 'secondary' })}>
          <PackageIcon aria-hidden="true" />
          {t('catalog')}
        </Link>
        <Link href="/customers" className={buttonVariants({ variant: 'secondary' })}>
          <UsersIcon aria-hidden="true" />
          {t('customers')}
        </Link>
      </div>
    </main>
  );
}
