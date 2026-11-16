'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PauseIcon, PlayIcon, UserRoundCheckIcon, UserRoundXIcon } from 'lucide-react';
import { sileo } from 'sileo';
import {
  setCreditAccountStatusAction,
  setCustomerActiveAction,
  type CustomerActionResult,
} from '@/presentation/actions/customers';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';

type Pending = 'suspend' | 'deactivate' | null;

export function CustomerActions({
  customerId,
  name,
  isActive,
  accountStatus,
  hasBalance,
  canTerms,
  canDeactivate,
  isReadOnly,
}: {
  customerId: string;
  name: string;
  isActive: boolean;
  accountStatus: string | null;
  hasBalance: boolean;
  canTerms: boolean;
  canDeactivate: boolean;
  isReadOnly: boolean;
}) {
  const t = useTranslations('Customers.detail');
  const tPlans = useTranslations('Plans');
  const router = useRouter();
  const [confirm, setConfirm] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function runWithUndo(
    task: () => Promise<CustomerActionResult>,
    undoTask: () => Promise<CustomerActionResult>,
    toastTitle: string,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      setConfirm(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      sileo.clear();
      sileo.success({
        title: toastTitle,
        duration: 6000,
        autopilot: { expand: 0, collapse: 5800 },
        button: isReadOnly
          ? undefined
          : {
              title: t('undo'),
              onClick: () => {
                startTransition(async () => {
                  const undoResult = await undoTask();
                  if (!undoResult.ok) {
                    setError(undoResult.error);
                    return;
                  }
                  sileo.clear();
                  sileo.info({ title: t('toast.undone') });
                  router.refresh();
                });
              },
            },
      });
      router.refresh();
    });
  }

  const showSuspend = canTerms && isActive && accountStatus === 'ACTIVE';
  const showResume = canTerms && isActive && accountStatus === 'SUSPENDED' && !isReadOnly;
  const showDeactivate = canDeactivate && isActive;
  const showReactivate = canDeactivate && !isActive && !isReadOnly;

  if (!showSuspend && !showResume && !showDeactivate && !showReactivate) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Notice tone={error === 'planLimit' ? 'warning' : 'error'}>
          <p>{t(`errors.${error}`)}</p>
          {error === 'planLimit' ? (
            <Link
              href="/settings/subscription"
              className="font-semibold underline underline-offset-4"
            >
              {tPlans('seePlans')}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showSuspend ? (
          <Button variant="secondary" onClick={() => setConfirm('suspend')} disabled={busy}>
            <PauseIcon aria-hidden="true" />
            {t('suspend')}
          </Button>
        ) : null}
        {showResume ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              runWithUndo(
                () => setCreditAccountStatusAction(customerId, 'ACTIVE'),
                () => setCreditAccountStatusAction(customerId, 'SUSPENDED'),
                t('toast.resumed', { name }),
              )
            }
          >
            <PlayIcon aria-hidden="true" />
            {t('resume')}
          </Button>
        ) : null}
        {showDeactivate ? (
          <Button
            variant="ghost"
            onClick={() => setConfirm('deactivate')}
            disabled={busy || hasBalance}
          >
            <UserRoundXIcon aria-hidden="true" />
            {t('deactivate')}
          </Button>
        ) : null}
        {showReactivate ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              runWithUndo(
                () => setCustomerActiveAction(customerId, true),
                () => setCustomerActiveAction(customerId, false),
                t('toast.reactivated', { name }),
              )
            }
          >
            <UserRoundCheckIcon aria-hidden="true" />
            {t('reactivate')}
          </Button>
        ) : null}
      </div>

      {showDeactivate && hasBalance ? (
        <p className="text-[13px] text-ink-soft">{t('inactiveDisabledBalance')}</p>
      ) : null}

      <ResponsiveSheet
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        closeLabel={t('cancel')}
        title={confirm === 'suspend' ? t('suspendTitle', { name }) : t('deactivateTitle', { name })}
        footer={
          confirm ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  confirm === 'suspend'
                    ? runWithUndo(
                        () => setCreditAccountStatusAction(customerId, 'SUSPENDED'),
                        () => setCreditAccountStatusAction(customerId, 'ACTIVE'),
                        t('toast.suspended', { name }),
                      )
                    : runWithUndo(
                        () => setCustomerActiveAction(customerId, false),
                        () => setCustomerActiveAction(customerId, true),
                        t('toast.deactivated', { name }),
                      )
                }
              >
                {t('confirm')}
              </Button>
            </>
          ) : null
        }
      >
        <p className="text-sm text-ink-soft">
          {confirm === 'suspend' ? t('suspendBody') : t('deactivateBody')}
        </p>
      </ResponsiveSheet>
    </div>
  );
}
