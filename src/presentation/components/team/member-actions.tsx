'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import type { TeamMemberStatus } from '@/core/domain/ports/team-repository';
import {
  cancelInviteAction,
  resendInviteAction,
  setEmployeeActiveAction,
  type TeamActionResult,
} from '@/presentation/actions/team';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';

type Pending = 'cancel' | 'deactivate' | null;
type SuccessKind = 'resent' | 'canceled' | 'deactivated' | 'reactivated';

export function MemberActions({
  userId,
  name,
  status,
  storeIsReadOnly,
}: {
  userId: string;
  name: string;
  status: TeamMemberStatus;
  storeIsReadOnly: boolean;
}) {
  const t = useTranslations('Team.member');
  const tTeam = useTranslations('Team');
  const tPlans = useTranslations('Plans');
  const router = useRouter();
  const [confirm, setConfirm] = useState<Pending>(null);
  // Solo el tope del plan se queda en pantalla: pide ir a Suscripción (DESIGN §7.3)
  const [planLimit, setPlanLimit] = useState(false);
  const [busy, startTransition] = useTransition();

  function showSuccessToast(kind: SuccessKind) {
    if (kind === 'resent') {
      sileo.success({ title: t('messages.resent') });
      return;
    }
    if (kind === 'canceled') {
      sileo.success({ title: t('messages.canceled', { name }) });
      return;
    }
    if (kind === 'reactivated') {
      sileo.success({ title: t('messages.reactivated', { name }) });
      return;
    }
    sileo.success({
      title: t('messages.deactivated', { name }),
    });
  }

  function run(task: () => Promise<TeamActionResult>, successKind: SuccessKind) {
    setPlanLimit(false);
    startTransition(async () => {
      const result = await task();
      setConfirm(null);
      if (!result.ok) {
        if (result.error === 'planLimit') setPlanLimit(true);
        else sileo.error({ title: t(`messages.${result.error}`) });
      } else {
        showSuccessToast(successKind);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {status === 'INVITED' ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || storeIsReadOnly}
              onClick={() => run(() => resendInviteAction(userId), 'resent')}
            >
              {t('resend')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirm('cancel')}
            >
              {t('cancelInvite')}
            </Button>
          </>
        ) : null}
        {status === 'ACTIVE' ? (
          <Button
            type="button"
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
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || storeIsReadOnly}
            onClick={() => run(() => setEmployeeActiveAction(userId, true), 'reactivated')}
          >
            {t('reactivate')}
          </Button>
        ) : null}
      </div>

      {planLimit ? (
        <Notice tone="warning" className="text-left">
          <p>{t('messages.planLimit')}</p>
          <Link
            href="/settings/subscription"
            className="w-fit font-semibold underline underline-offset-4"
          >
            {tPlans('seePlans')}
          </Link>
        </Notice>
      ) : null}

      <ResponsiveSheet
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        title={confirm === 'cancel' ? t('cancelTitle', { name }) : t('deactivateTitle', { name })}
        closeLabel={tTeam('close')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              {t('keep')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                confirm === 'cancel'
                  ? run(() => cancelInviteAction(userId), 'canceled')
                  : run(() => setEmployeeActiveAction(userId, false), 'deactivated')
              }
            >
              {confirm === 'cancel' ? t('cancelConfirm') : t('deactivateConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {confirm === 'cancel' ? t('cancelBody') : t('deactivateBody')}
        </p>
      </ResponsiveSheet>
    </div>
  );
}
