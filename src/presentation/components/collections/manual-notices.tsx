'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BellRingIcon, MailIcon } from 'lucide-react';
import {
  sendChargeDigestsAction,
  sendPaymentRemindersAction,
  type ManualNoticeResult,
} from '@/presentation/actions/collections';
import { sileo } from 'sileo';
import { Button } from '@/presentation/components/ui/button';

/** P5: en el Plan Casero los avisos de cobranza salen cuando el dueño o el empleado lo piden. */
export function ManualNotices() {
  const t = useTranslations('Collections.manual');
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  function run(task: () => Promise<ManualNoticeResult>) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) sileo.error({ title: t(`errors.${result.error}`) });
      else
        sileo[result.failed > 0 ? 'warning' : 'success']({
          title:
            result.queued === 0 && result.sent === 0
              ? t('nothing')
              : t('sent', { sent: result.sent, failed: result.failed }),
        });
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="manual-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="manual-title" className="text-lg font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="text-sm text-ink-soft">{t('hint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run(sendChargeDigestsAction)}>
          <MailIcon aria-hidden="true" />
          {t('digests')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(sendPaymentRemindersAction)}>
          <BellRingIcon aria-hidden="true" />
          {t('reminders')}
        </Button>
      </div>
    </section>
  );
}
