import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { enterPortalAction } from '@/presentation/actions/portal';
import { getSessionUser } from '@/presentation/auth/session';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';

/**
 * US14.2 y D5: el correo trae aquí el enlace mágico. El token se canjea al tocar
 * el botón (POST), no al abrir la página, para que un antivirus no lo gaste.
 */
export default async function PortalEnterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; to?: string }>;
}) {
  const { token, to } = await searchParams;
  const t = await getTranslations('Portal.enter');
  const tAuth = await getTranslations('Auth');
  const current = await getSessionUser();

  return (
    <AuthShell
      logoAlt={tAuth('logoAlt')}
      title={t('title')}
      subtitle={t('subtitle')}
      aside="portal"
    >
      {token ? (
        <form action={enterPortalAction} className="flex flex-col gap-4">
          {current ? (
            <Notice tone="warning">
              <p>{t('otherSession', { email: current.email })}</p>
            </Notice>
          ) : null}
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="to" value={to ?? '/portal'} />
          <Button type="submit" size="lg" className="w-full text-lg">
            {t('submit')}
          </Button>
        </form>
      ) : (
        <Notice tone="error">
          <p>
            {t('missing')}{' '}
            <Link href="/portal/login" className="font-medium text-link-active underline">
              {tAuth('login.customerLink')}
            </Link>
          </p>
        </Notice>
      )}
    </AuthShell>
  );
}
