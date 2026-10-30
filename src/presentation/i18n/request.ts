import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, resolveLocale } from './resolve-locale';

// users.preferred_locale se sumará al resolver cuando exista la sesión (Better Auth).
export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get('accept-language'),
  });

  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  };
});
