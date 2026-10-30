'use client';

import { useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

const TEST_SITE_KEY = '1x00000000000000000000AA';
export const TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

export function TurnstileField({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY;
  const isTestKey = siteKey === TEST_SITE_KEY;

  useEffect(() => {
    if (isTestKey) onToken(TURNSTILE_DUMMY_TOKEN);
  }, [isTestKey, onToken]);

  if (isTestKey) {
    return <div data-testid="turnstile-widget" aria-hidden="true" className="sr-only" />;
  }

  return (
    <div className="flex justify-center">
      <Turnstile
        siteKey={siteKey}
        onSuccess={onToken}
        onExpire={() => onToken('')}
        options={{ size: 'flexible' }}
      />
    </div>
  );
}
