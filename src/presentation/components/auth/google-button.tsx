'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/infrastructure/auth/auth-client';
import { Button } from '@/presentation/components/ui/button';

export type GoogleButtonProps = {
  callbackURL?: string;
  /** Se corre antes de ir a Google; si devuelve false, no se sale de la página. */
  onBeforeRedirect?: () => boolean;
};

// Una cuenta nueva sin la casilla de términos aceptada vuelve a /register con
// ?error= (auth.ts la rechaza con CONSENT_REQUIRED).
const ERROR_CALLBACK_URL = '/app/register';

const noSubscribe = () => () => {};

export function GoogleButton({ callbackURL = '/app', onBeforeRedirect }: GoogleButtonProps) {
  const t = useTranslations('Auth');
  const [loading, setLoading] = useState(false);
  // La cookie solo existe en el navegador: en el servidor no hay etiqueta, y se muestra al hidratar.
  const lastUsed = useSyncExternalStore(
    noSubscribe,
    () => authClient.isLastUsedLoginMethod('google'),
    () => false,
  );

  async function handleGoogle() {
    if (onBeforeRedirect && !onBeforeRedirect()) return;
    setLoading(true);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: ERROR_CALLBACK_URL,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="relative w-full"
      disabled={loading}
      onClick={handleGoogle}
    >
      <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 15.65 5 12c0-3.65 3.36-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
        />
      </svg>
      <span>{t('google')}</span>
      {lastUsed ? (
        <span className="absolute -top-2.5 right-3 rounded-full bg-soft px-2 py-0.5 text-xs font-semibold text-soft-ink">
          {t('lastUsed')}
        </span>
      ) : null}
    </Button>
  );
}
