'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangleIcon, BellRingIcon, Loader2Icon, MailIcon } from 'lucide-react';
import { sileo } from 'sileo';
import type { ManualNoticePreview } from '@/infrastructure/db/queries/collections';
import {
  sendChargeDigestsAction,
  sendPaymentRemindersAction,
  type ManualNoticeResult,
} from '@/presentation/actions/collections';
import { Button } from '@/presentation/components/ui/button';

/** P5: en el Plan Casero los avisos de cobranza salen cuando el dueño o el empleado lo piden. */
export function ManualNotices({
  preview,
  isReadOnly = false,
}: {
  preview?: ManualNoticePreview;
  isReadOnly?: boolean;
}) {
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="manual-title" className="text-lg font-semibold text-ink">
            {t('title')}
          </h2>
          <p className="text-sm text-ink-soft">{t('hint')}</p>
        </div>
        {preview ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px] tabular-nums">
            <span className="rounded-full bg-paper-deep px-2.5 py-1 text-ink-soft">
              {t('previewDigests', { count: preview.pendingDigests })}
            </span>
            <span className="rounded-full bg-paper-deep px-2.5 py-1 text-ink-soft">
              {t('previewReminders', { count: preview.pendingReminders })}
            </span>
          </div>
        ) : null}
      </div>

      {preview && preview.bouncedCustomers > 0 ? (
        <p className="flex flex-wrap items-center gap-2 rounded-field bg-amber/12 px-3 py-2 text-[13px] text-amber-ink">
          <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />
          <span>{t('bouncedNotice', { count: preview.bouncedCustomers })}</span>
          <Link
            href="/collections?filter=bounced"
            className="font-semibold underline underline-offset-4"
          >
            {t('seeBounced')}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || isReadOnly}
          onClick={() => run(sendChargeDigestsAction)}
        >
          {busy ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <MailIcon aria-hidden="true" />
          )}
          {t('digests')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || isReadOnly}
          onClick={() => run(sendPaymentRemindersAction)}
        >
          {busy ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <BellRingIcon aria-hidden="true" />
          )}
          {t('reminders')}
        </Button>
      </div>
    </section>
  );
}
