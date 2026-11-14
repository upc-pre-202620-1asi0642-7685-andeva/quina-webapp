import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { ServiceWorkerRegistration } from '@/presentation/components/pwa/pwa';
import '@/presentation/styles/globals.css';

// Una sola familia (DESIGN.md, sección 4). next/font/local respeta basePath '/app'.
const albertSans = localFont({
  src: [
    {
      path: '../presentation/fonts/AlbertSans-VariableFont_wght.woff2',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../presentation/fonts/AlbertSans-Italic-VariableFont_wght.woff2',
      weight: '100 900',
      style: 'italic',
    },
  ],
  variable: '--font-albert-sans',
  display: 'swap',
});

// Aplica el tema guardado (clave `theme`, compartida con el sitio) antes de pintar.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;

/**
 * `viewport-fit=cover` activa los `env(safe-area-inset-*)` de la barra inferior,
 * el encabezado y la hoja del carrito; sin él valen 0. El color de la barra del
 * sistema copia `--color-surface` de cada tema (aquí no se pueden usar tokens).
 */
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#242926' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');
  return {
    title: t('title'),
    description: t('description'),
    // US22: en iPhone "Añadir a pantalla de inicio" abre a pantalla completa
    appleWebApp: { capable: true, title: 'Quina', statusBarStyle: 'default' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={albertSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
