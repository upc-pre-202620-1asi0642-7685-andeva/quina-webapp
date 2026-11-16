'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon, CopyIcon, Maximize2Icon } from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';

export function CopyPaymentValueButton({ label, value }: { label: string; value: string }) {
  const t = useTranslations('Portal.payment');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      sileo.success({ title: t('copied', { label }) });
    } catch {
      sileo.error({ title: t('copyError') });
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleCopy}
      aria-label={t('copyLabel', { label })}
      className="shrink-0 gap-1.5"
    >
      {copied ? (
        <CheckIcon aria-hidden="true" className="size-4 text-success-ink" />
      ) : (
        <CopyIcon aria-hidden="true" className="size-4 text-ink-soft" />
      )}
      <span>{copied ? t('copiedShort') : t('copy')}</span>
    </Button>
  );
}

export function QrZoomTrigger({ qrUrl, storeName }: { qrUrl: string; storeName: string }) {
  const t = useTranslations('Portal.payment');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex flex-col items-center gap-2 self-center rounded-field border border-line bg-white p-3 transition-[transform,border-color] duration-150 ease-(--ease-out-expo) hover:border-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-active active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 sm:self-start"
        aria-label={t('zoomQr')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, sin optimizador */}
        <img src={qrUrl} alt={t('qrAlt')} className="size-44 object-contain" />
        <span className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-primary-dark">
          <Maximize2Icon aria-hidden="true" className="size-4" />
          <span>{t('zoomQr')}</span>
        </span>
      </button>

      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title={t('qrTitle', { store: storeName })}
        description={t('qrHint')}
        closeLabel={t('closeQr')}
        footer={
          <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(false)}>
            {t('closeQr')}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="rounded-card border border-line bg-white p-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal */}
            <img
              src={qrUrl}
              alt={t('qrAlt')}
              className="size-64 max-w-full object-contain sm:size-72"
            />
          </div>
        </div>
      </ResponsiveSheet>
    </>
  );
}
