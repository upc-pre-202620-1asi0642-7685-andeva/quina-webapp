'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { TeamMemberStatus } from '@/core/domain/ports/team-repository';
import {
  cancelInviteAction,
  resendInviteAction,
  setEmployeeActiveAction,
  type TeamActionResult,
} from '@/presentation/actions/team';
import { sileo } from 'sileo';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/presentation/components/ui/dialog';

type Pending = 'cancel' | 'deactivate' | null;

export function MemberActions({
  userId,
  name,
  status,
}: {
  userId: string;
  name: string;
  status: TeamMemberStatus;
}) {
  const t = useTranslations('Team.member');
  const tPlans = useTranslations('Plans');
  const router = useRouter();
  const [confirm, setConfirm] = useState<Pending>(null);
  // Solo el tope del plan se queda en pantalla: pide ir a Suscripción (DESIGN §7.3)
  const [planLimit, setPlanLimit] = useState(false);
  const [busy, startTransition] = useTransition();

  function run(task: () => Promise<TeamActionResult>, successKey?: string) {
    setPlanLimit(false);
    startTransition(async () => {
      const result = await task();
      setConfirm(null);
      if (!result.ok) {
        if (result.error === 'planLimit') setPlanLimit(true);
        else sileo.error({ title: t(`messages.${result.error}`) });
      } else if (successKey) {
        sileo.success({ title: t(`messages.${successKey}`) });
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === 'INVITED' ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run(() => resendInviteAction(userId), 'resent')}
            >
              {t('resend')}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm('cancel')}>
              {t('cancelInvite')}
            </Button>
          </>
        ) : null}
        {status === 'ACTIVE' ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setConfirm('deactivate')}
          >
            {t('deactivate')}
          </Button>
        ) : null}
        {status === 'DEACTIVATED' ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => setEmployeeActiveAction(userId, true))}
          >
            {t('reactivate')}
          </Button>
        ) : null}
      </div>

      {planLimit ? (
        <Notice tone="warning">
          <p>{t('messages.planLimit')}</p>
          <Link
            href="/settings/subscription"
            className="font-semibold underline underline-offset-4"
          >
            {tPlans('seePlans')}
          </Link>
        </Notice>
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => (open ? null : setConfirm(null))}>
        <DialogContent showCloseButton={false} className="rounded-card border-line bg-surface">
          <DialogTitle className="text-lg text-ink">
            {confirm === 'cancel' ? t('cancelTitle', { name }) : t('deactivateTitle', { name })}
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">
            {confirm === 'cancel' ? t('cancelBody') : t('deactivateBody')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              {t('keep')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(() =>
                  confirm === 'cancel'
                    ? cancelInviteAction(userId)
                    : setEmployeeActiveAction(userId, false),
                )
              }
            >
              {confirm === 'cancel' ? t('cancelConfirm') : t('deactivateConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
