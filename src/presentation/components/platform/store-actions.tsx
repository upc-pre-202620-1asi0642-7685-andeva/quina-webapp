'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MailIcon, PauseIcon, PlayIcon } from 'lucide-react';
import {
  resendOwnerLinkAction,
  setStoreActiveAction,
  type PlatformActionResult,
} from '@/presentation/actions/platform';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/presentation/components/ui/dialog';

export function StoreActions({
  storeId,
  name,
  isActive,
  ownerPending,
}: {
  storeId: string;
  name: string;
  isActive: boolean;
  ownerPending: boolean;
}) {
  const t = useTranslations('Platform.detail');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; key: string }>();
  const [busy, startTransition] = useTransition();

  function run(task: () => Promise<PlatformActionResult>, successKey?: string) {
    setMessage(undefined);
    startTransition(async () => {
      const result = await task();
      setConfirming(false);
      if (!result.ok) setMessage({ tone: 'error', key: result.error });
      else if (successKey) setMessage({ tone: 'success', key: successKey });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <Notice tone={message.tone}>
          <p>{t(`messages.${message.key}`)}</p>
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {ownerPending && isActive ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => resendOwnerLinkAction(storeId), 'resent')}
          >
            <MailIcon aria-hidden="true" />
            {t('resend')}
          </Button>
        ) : null}
        {isActive ? (
          <Button variant="destructive" disabled={busy} onClick={() => setConfirming(true)}>
            <PauseIcon aria-hidden="true" />
            {t('suspend')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => setStoreActiveAction(storeId, true), 'reactivated')}
          >
            <PlayIcon aria-hidden="true" />
            {t('reactivate')}
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false} className="rounded-card border-line bg-surface">
          <DialogTitle className="text-lg text-ink">{t('suspendTitle', { name })}</DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">
            {t('suspendBody')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              {t('keep')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => run(() => setStoreActiveAction(storeId, false), 'suspended')}
            >
              {t('suspendConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
