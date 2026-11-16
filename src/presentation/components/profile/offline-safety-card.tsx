'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HardDriveIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { sileo } from 'sileo';
import { clearOfflinePages, PAGES_CACHE } from '@/presentation/components/pwa/pwa';
import { Button } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

export function OfflineSafetyCard({ variant = 'store' }: { variant?: 'store' | 'portal' }) {
  const portal = variant === 'portal';
  const t = useTranslations('Profile.offline');
  const [hasCache, setHasCache] = useState<boolean | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkCache() {
      if (typeof window === 'undefined' || !('caches' in window)) {
        if (active) setHasCache(false);
        return;
      }
      const exists = await caches.has(PAGES_CACHE);
      if (active) setHasCache(exists);
    }
    void checkCache();
    return () => {
      active = false;
    };
  }, []);

  async function handleClearCache() {
    setClearing(true);
    try {
      await clearOfflinePages();
      setHasCache(false);
      sileo.success({ title: t('cleared') });
    } finally {
      setClearing(false);
    }
  }

  return (
    <section
      aria-labelledby="profile-offline-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
          <HardDriveIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2
            id="profile-offline-title"
            className={cn('font-semibold text-ink', portal ? 'text-xl' : 'text-lg')}
          >
            {t('title')}
          </h2>
          <p className={cn('text-ink-soft', portal ? 'text-base' : 'text-sm')}>
            {hasCache === false ? t('emptyDescription') : t('description')}
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        size={portal ? 'lg' : 'default'}
        disabled={clearing || hasCache === false}
        onClick={handleClearCache}
        className="w-full shrink-0 sm:w-auto"
      >
        {clearing ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <Trash2Icon aria-hidden="true" />
        )}
        <span>{t('clearButton')}</span>
      </Button>
    </section>
  );
}
