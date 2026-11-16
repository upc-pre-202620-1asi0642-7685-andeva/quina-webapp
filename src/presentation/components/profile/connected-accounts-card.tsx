'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2Icon, KeyRoundIcon, Loader2Icon, UnlinkIcon } from 'lucide-react';
import { sileo } from 'sileo';
import { authClient } from '@/infrastructure/auth/auth-client';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { cn } from '@/presentation/lib/utils';

export function ConnectedAccountsCard({
  hasPassword,
  hasGoogle,
  googleAccountId,
  googleEnabled,
}: {
  hasPassword: boolean;
  hasGoogle: boolean;
  googleAccountId: string | null;
  googleEnabled: boolean;
}) {
  const t = useTranslations('Profile.accounts');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  async function handleLinkGoogle() {
    setBusy(true);
    try {
      const { error } = await authClient.linkSocial({
        provider: 'google',
        callbackURL: '/app/profile/security',
      });
      if (error) {
        sileo.error({ title: t('linkError') });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlinkGoogle() {
    if (!googleAccountId) return;
    setBusy(true);
    try {
      const { error } = await authClient.unlinkAccount({
        accountId: googleAccountId,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        sileo.error({
          title: code === 'FRESH_SESSION_REQUIRED' ? t('freshSessionRequired') : t('unlinkError'),
        });
        return;
      }
      setConfirmUnlink(false);
      sileo.success({ title: t('unlinked') });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="profile-accounts-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="profile-accounts-title" className="text-lg font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="text-sm text-ink-soft">{t('subtitle')}</p>
      </div>

      <ul className="divide-y divide-line rounded-field border border-line bg-paper/40">
        {/* Método: Correo y contraseña */}
        <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
              <KeyRoundIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">{t('credentialLabel')}</span>
              <span className="text-[13px] text-ink-soft">
                {hasPassword ? t('credentialActive') : t('credentialInactive')}
              </span>
            </div>
          </div>

          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
              hasPassword ? 'bg-success/12 text-success-ink' : 'bg-paper-deep text-ink-soft',
            )}
          >
            {hasPassword ? (
              <CheckCircle2Icon aria-hidden="true" className="size-3.5 shrink-0" />
            ) : null}
            <span>{hasPassword ? t('connected') : t('notConfigured')}</span>
          </span>
        </li>

        {/* Método: Google */}
        <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-sm font-bold text-ink">
              G
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">{t('googleLabel')}</span>
              <span className="text-[13px] text-ink-soft">
                {hasGoogle
                  ? hasPassword
                    ? t('googleActive')
                    : t('googleOnlyHint')
                  : googleEnabled
                    ? t('googleAvailable')
                    : t('googleDisabled')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasGoogle ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!hasPassword || busy}
                onClick={() => setConfirmUnlink(true)}
              >
                <UnlinkIcon aria-hidden="true" />
                <span>{t('unlinkGoogle')}</span>
              </Button>
            ) : googleEnabled ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={handleLinkGoogle}
              >
                {busy ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
                <span>{t('linkGoogle')}</span>
              </Button>
            ) : (
              <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                {t('notConfigured')}
              </span>
            )}
          </div>
        </li>
      </ul>

      <ResponsiveSheet
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        title={t('unlinkConfirmTitle')}
        description={t('unlinkConfirmBody')}
        closeLabel={t('cancel')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmUnlink(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={handleUnlinkGoogle}
            >
              {busy ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              <span>{t('unlinkConfirmAction')}</span>
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{t('unlinkConfirmHint')}</p>
      </ResponsiveSheet>
    </section>
  );
}
