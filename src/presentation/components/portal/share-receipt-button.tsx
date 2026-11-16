'use client';

import { useTranslations } from 'next-intl';
import { Share2Icon } from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/presentation/components/ui/button';

export function ShareReceiptButton({ title, summary }: { title: string; summary: string }) {
  const t = useTranslations('Portal.receipt');

  async function handleShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: summary });
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(summary);
      sileo.success({ title: t('copiedSummary') });
    } catch {
      sileo.error({ title: t('shareError') });
    }
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="lg"
      onClick={handleShare}
      className="print:hidden"
    >
      <Share2Icon aria-hidden="true" />
      <span>{t('share')}</span>
    </Button>
  );
}
