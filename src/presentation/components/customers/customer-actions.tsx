'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PauseIcon, PlayIcon, UserRoundXIcon, UserRoundCheckIcon } from 'lucide-react';
import {
  setCreditAccountStatusAction,
  setCustomerActiveAction,
  type CustomerActionResult,
} from '@/presentation/actions/customers';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/presentation/components/ui/dialog';

type Pending = 'suspend' | 'deactivate' | null;

export function CustomerActions({
  customerId,
  name,
  isActive,
  accountStatus,
}: {
  customerId: string;
  name: string;
  isActive: boolean;
  accountStatus: string | null;
}) {
  const t = useTranslations('Customers.detail');
  const tPlans = useTranslations('Plans');
  const router = useRouter();
  const [confirm, setConfirm] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function run(task: () => Promise<CustomerActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      setConfirm(null);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Notice tone={error === 'planLimit' ? 'warning' : 'error'}>
          <p>{t(`errors.${error}`)}</p>
          {error === 'planLimit' ? (
            <Link href="/settings" className="font-semibold underline underline-offset-4">
              {tPlans('seePlans')}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isActive && accountStatus === 'ACTIVE' ? (
          <Button variant="secondary" onClick={() => setConfirm('suspend')} disabled={busy}>
            <PauseIcon aria-hidden="true" />
            {t('suspend')}
          </Button>
        ) : null}
        {isActive && accountStatus === 'SUSPENDED' ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => setCreditAccountStatusAction(customerId, 'ACTIVE'))}
          >
            <PlayIcon aria-hidden="true" />
            {t('resume')}
          </Button>
        ) : null}
        {isActive ? (
          <Button variant="ghost" onClick={() => setConfirm('deactivate')} disabled={busy}>
            <UserRoundXIcon aria-hidden="true" />
            {t('deactivate')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => setCustomerActiveAction(customerId, true))}
          >
            <UserRoundCheckIcon aria-hidden="true" />
            {t('reactivate')}
          </Button>
        )}
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => (open ? null : setConfirm(null))}>
        <DialogContent showCloseButton={false} className="rounded-card border-line bg-surface">
          <DialogTitle className="text-lg text-ink">
            {confirm === 'suspend' ? t('suspendTitle', { name }) : t('deactivateTitle', { name })}
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">
            {confirm === 'suspend' ? t('suspendBody') : t('deactivateBody')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(() =>
                  confirm === 'suspend'
                    ? setCreditAccountStatusAction(customerId, 'SUSPENDED')
                    : setCustomerActiveAction(customerId, false),
                )
              }
            >
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
