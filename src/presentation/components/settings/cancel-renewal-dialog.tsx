'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sileo } from 'sileo';
import { PlanLimits, type CountedResource } from '@/core/domain/billing/plan-limits';
import { cancelSubscriptionRenewalAction } from '@/presentation/actions/billing';
import { Notice } from '@/presentation/components/notice';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';

/** Confirmación para cancelar renovación automática, con aviso preventivo si supera Casero. */
export function CancelRenewalDialog({
  usage,
  currentPeriodEndLabel,
}: {
  usage: Record<CountedResource, number>;
  currentPeriodEndLabel: string | null;
}) {
  const t = useTranslations('Settings');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const overLimit = PlanLimits.overLimitResources('CASERO', usage);
  const caseroLimits = PlanLimits.of('CASERO');

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await cancelSubscriptionRenewalAction();
      if (!result.ok) {
        sileo.error({ title: t('billingNotice.checkoutError') });
        return;
      }
      setOpen(false);
      sileo.success({ title: t('billingNotice.canceled') });
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={isPending}>
        {t('cancelRenewal')}
      </Button>

      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title={t('cancelConfirmTitle')}
        closeLabel={t('cancelKeepAction')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t('cancelKeepAction')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirm}
            >
              {isPending ? t('cancelingRenewal') : t('cancelConfirmAction')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {t('cancelConfirmBody', { date: currentPeriodEndLabel ?? '—' })}
        </p>

        {overLimit.length > 0 ? (
          <Notice tone="warning">
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold">{t('cancelOverLimitWarningTitle')}</p>
              <p>{t('cancelOverLimitWarningBody', { date: currentPeriodEndLabel ?? '—' })}</p>
              <ul className="list-disc pl-4 font-normal">
                {overLimit.map((resource) => (
                  <li key={resource} className="tabular-nums">
                    {t('cancelOverLimitItem', {
                      resource: t(`usage.${resource}`),
                      used: usage[resource],
                      max: caseroLimits[resource] ?? 0,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          </Notice>
        ) : null}
      </ResponsiveSheet>
    </>
  );
}
