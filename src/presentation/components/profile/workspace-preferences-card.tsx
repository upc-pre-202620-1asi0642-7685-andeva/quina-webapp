'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboardIcon, Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { sileo } from 'sileo';
import { saveDashboardLayoutAction } from '@/presentation/actions/dashboard';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';

export function WorkspacePreferencesCard({ hasCustomDashboard }: { hasCustomDashboard: boolean }) {
  const t = useTranslations('Profile.workspace');
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [customized, setCustomized] = useState(hasCustomDashboard);
  const [isPending, startTransition] = useTransition();

  function handleReset() {
    startTransition(async () => {
      const res = await saveDashboardLayoutAction(null);
      if (!res.ok) {
        sileo.error({ title: t('resetError') });
        return;
      }
      setCustomized(false);
      setConfirmOpen(false);
      sileo.success({ title: t('resetSuccess') });
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="profile-workspace-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
          <LayoutDashboardIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="profile-workspace-title" className="text-lg font-semibold text-ink">
              {t('title')}
            </h2>
            <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink-soft">
              {customized ? t('statusCustom') : t('statusDefault')}
            </span>
          </div>
          <p className="text-sm text-ink-soft">{t('description')}</p>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        disabled={!customized || isPending}
        onClick={() => setConfirmOpen(true)}
        className="w-full shrink-0 sm:w-auto"
      >
        <RotateCcwIcon aria-hidden="true" />
        <span>{t('resetButton')}</span>
      </Button>

      <ResponsiveSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('confirmTitle')}
        description={t('confirmBody')}
        closeLabel={t('cancel')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setConfirmOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={isPending} onClick={handleReset}>
              {isPending ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              <span>{t('confirmAction')}</span>
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{t('confirmHint')}</p>
      </ResponsiveSheet>
    </section>
  );
}
