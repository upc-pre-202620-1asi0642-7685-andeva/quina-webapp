import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { readAccountSetup } from '@/infrastructure/auth/account-setup';
import { acceptInviteAction } from '@/presentation/actions/accept-invite';
import { AuthShell } from '@/presentation/components/auth/auth-shell';
import { buttonVariants } from '@/presentation/components/ui/button';
import { AcceptInviteForm } from './accept-invite-form';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  const invite = await readAccountSetup(token, new Date());
  const t = await getTranslations('AcceptInvite');
  const tAuth = await getTranslations('Auth');

  if (!invite) {
    return (
      <AuthShell logoAlt={tAuth('logoAlt')} title={t('invalidTitle')} subtitle={t('invalid')}>
        <Link href="/login" className={buttonVariants({ variant: 'primary', className: 'w-full' })}>
          {t('goToLogin')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      logoAlt={tAuth('logoAlt')}
      title={t('title', { name: invite.name.split(' ')[0] ?? invite.name })}
      subtitle={
        invite.storeName ? t('subtitleStore', { store: invite.storeName }) : t('subtitlePlatform')
      }
    >
      <AcceptInviteForm email={invite.email} action={acceptInviteAction.bind(null, token)} />
    </AuthShell>
  );
}
