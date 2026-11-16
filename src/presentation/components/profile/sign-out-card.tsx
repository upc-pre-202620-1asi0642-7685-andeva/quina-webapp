'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2Icon, LogOutIcon } from 'lucide-react';
import { authClient } from '@/infrastructure/auth/auth-client';
import { clearOfflinePages } from '@/presentation/components/pwa/pwa';
import { Button } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

export function SignOutCard({ variant = 'store' }: { variant?: 'store' | 'portal' }) {
  const t = useTranslations('Profile');
  const portal = variant === 'portal';
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      // US22: lo guardado para leer sin señal no se queda en un celular compartido
      await clearOfflinePages();
      window.location.replace(portal ? '/app/portal/login' : '/app/login');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section
      aria-labelledby="profile-signout-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="profile-signout-title"
          className={cn('font-semibold text-ink', portal ? 'text-xl' : 'text-lg')}
        >
          {t('signOutSection.title')}
        </h2>
        <p className={cn('text-ink-soft', portal ? 'text-base' : 'text-sm')}>
          {t('signOutSection.description')}
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        size={portal ? 'lg' : 'default'}
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full shrink-0 sm:w-auto"
      >
        {signingOut ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <LogOutIcon aria-hidden="true" />
        )}
        <span>{t('signOut')}</span>
      </Button>
    </section>
  );
}
