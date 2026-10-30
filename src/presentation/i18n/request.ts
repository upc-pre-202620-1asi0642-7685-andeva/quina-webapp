import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getSessionUser } from '@/presentation/auth/session';
import { LOCALE_COOKIE, resolveLocale } from './resolve-locale';

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  let userPreference: string | undefined;
  try {
    if (
      cookieStore.get('better-auth.session_token') ||
      cookieStore.get('__Secure-better-auth.session_token')
    ) {
      const user = await getSessionUser();
      userPreference = user?.preferredLocale;
    }
  } catch {
    // Si la sesión no se puede consultar durante el render, cae a la cookie/navegador
  }

  const locale = resolveLocale({
    userPreference,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get('accept-language'),
  });

  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  };
});
