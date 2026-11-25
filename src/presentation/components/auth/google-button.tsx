'use client';

import Image from 'next/image';
import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/infrastructure/auth/auth-client';
import { Button } from '@/presentation/components/ui/button';
import googleLogo from '../../../../public/google.svg';

export type GoogleButtonProps = {
  callbackURL?: string;
  /** A dónde vuelve si Google falla o la cuenta no se puede crear (?error=). */
  errorCallbackURL?: string;
  /** Se corre antes de ir a Google; si devuelve false, no se sale de la página. */
  onBeforeRedirect?: () => boolean;
  size?: 'default' | 'lg';
};

// Una cuenta nueva sin la casilla de términos aceptada vuelve a /register con
// ?error= (auth.ts la rechaza con CONSENT_REQUIRED).
const ERROR_CALLBACK_URL = '/app/register';

const noSubscribe = () => () => {};

export function GoogleButton({
  callbackURL = '/app',
  errorCallbackURL = ERROR_CALLBACK_URL,
  onBeforeRedirect,
  size = 'default',
}: GoogleButtonProps) {
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
        errorCallbackURL,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className="relative w-full"
      disabled={loading}
      onClick={handleGoogle}
    >
      <Image src={googleLogo} alt="" aria-hidden="true" className="size-5 shrink-0" />
      <span>{t('google')}</span>
      {lastUsed ? (
        <span className="absolute -top-2.5 right-3 rounded-full bg-soft px-2 py-0.5 text-xs font-semibold text-soft-ink">
          {t('lastUsed')}
        </span>
      ) : null}
    </Button>
  );
}
