import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ThemeChoice } from '@/core/domain/shared/theme';
import { getSessionUser } from '@/presentation/auth/session';
import { ServiceWorkerRegistration } from '@/presentation/components/pwa/pwa';
import { resolveTheme, THEME_COOKIE } from '@/presentation/lib/resolve-theme';
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

function buildThemeScript(hasSession: boolean, choice: ThemeChoice): string {
  if (choice === 'light' || choice === 'dark') {
    return `document.documentElement.setAttribute('data-theme',${JSON.stringify(choice)});`;
  }
  // Con sesión en modo 'system', manda la preferencia del dispositivo sin leer quina-theme ni localStorage.
  if (hasSession) {
    return `(function(){try{var t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;
  }
  // Sin sesión (rutas públicas), si tampoco hubo cookie quina-theme, respeta localStorage.theme antes del sistema.
  return `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;
}

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
  const [locale, cookieStore] = await Promise.all([getLocale(), cookies()]);

  let userPreference: ThemeChoice | undefined;
  let hasSession = false;
  try {
    if (
      cookieStore.get('better-auth.session_token') ||
      cookieStore.get('__Secure-better-auth.session_token')
    ) {
      const user = await getSessionUser();
      if (user) {
        hasSession = true;
        userPreference = user.preferredTheme;
      }
    }
  } catch {
    // Si la sesión no se puede consultar durante el render, cae a la cookie/sistema
  }

  const themeChoice = resolveTheme({
    userPreference,
    cookie: cookieStore.get(THEME_COOKIE)?.value,
  });
  const serverTheme = themeChoice === 'system' ? undefined : themeChoice;
  const themeScript = buildThemeScript(hasSession, themeChoice);

  return (
    <html
      lang={locale}
      data-theme={serverTheme}
      data-theme-choice={themeChoice}
      className={albertSans.variable}
      suppressHydrationWarning
    >
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
