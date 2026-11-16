'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon, CopyIcon, MessageCircleIcon } from 'lucide-react';
import { sileo } from 'sileo';
import { Button, buttonVariants } from '@/presentation/components/ui/button';
import { whatsappWithMessageHref } from '@/presentation/lib/collections-list';

export function ReceiptActions({
  summaryText,
  customerPhone,
  whatsappMessage,
}: {
  summaryText: string;
  customerPhone: string | null;
  whatsappMessage: string;
}) {
  const t = useTranslations('Collections.receipt');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      sileo.success({ title: t('copied') });
    } catch {
      sileo.error({ title: t('copyError') });
    }
  }

  const waHref = whatsappWithMessageHref(customerPhone, whatsappMessage);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button type="button" variant="secondary" onClick={copySummary}>
        {copied ? (
          <CheckIcon aria-hidden="true" className="text-success-ink" />
        ) : (
          <CopyIcon aria-hidden="true" />
        )}
        {copied ? t('copiedShort') : t('copy')}
      </Button>
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'secondary' })}
        >
          <MessageCircleIcon aria-hidden="true" />
          {t('whatsapp')}
        </a>
      ) : null}
    </div>
  );
}
