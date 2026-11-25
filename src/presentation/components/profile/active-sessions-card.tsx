'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2Icon,
  LogOutIcon,
  MonitorIcon,
  ShieldAlertIcon,
  SmartphoneIcon,
  TabletIcon,
} from 'lucide-react';
import { sileo } from 'sileo';
import { authClient } from '@/infrastructure/auth/auth-client';
import { Button } from '@/presentation/components/ui/button';
import { ResponsiveSheet } from '@/presentation/components/ui/responsive-sheet';
import { formatDateTime } from '@/presentation/lib/format-date';
import { cn } from '@/presentation/lib/utils';
import type { ProfileSessionItem } from '@/presentation/queries/profile';

const DEVICE_ICONS = {
  mobile: SmartphoneIcon,
  tablet: TabletIcon,
  desktop: MonitorIcon,
} as const;

export function ActiveSessionsCard({
  sessions,
  variant = 'store',
}: {
  sessions: ProfileSessionItem[];
  variant?: 'store' | 'portal';
}) {
  const portal = variant === 'portal';
  const t = useTranslations('Profile.sessions');
  const router = useRouter();

  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  async function handleRevokeOne(token: string) {
    setRevokingToken(token);
    try {
      const { error } = await authClient.revokeSession({ token });
      if (error) {
        sileo.error({ title: t('revokeError') });
        return;
      }
      sileo.success({ title: t('revokedOne') });
      router.refresh();
    } finally {
      setRevokingToken(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    try {
      const { error } = await authClient.revokeOtherSessions();
      if (error) {
        sileo.error({ title: t('revokeError') });
        return;
      }
      setConfirmOthers(false);
      sileo.success({ title: t('revokedOthers') });
      router.refresh();
    } finally {
      setRevokingOthers(false);
    }
  }

  return (
    <section
      aria-labelledby="profile-sessions-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="profile-sessions-title"
            className={cn('font-semibold text-ink', portal ? 'text-xl' : 'text-lg')}
          >
            {t('title')}
          </h2>
          <p className={cn('text-ink-soft', portal ? 'text-base' : 'text-sm')}>{t('subtitle')}</p>
        </div>

        {otherSessions.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size={portal ? 'lg' : 'sm'}
            onClick={() => setConfirmOthers(true)}
            disabled={revokingOthers || revokingToken !== null}
          >
            <ShieldAlertIcon aria-hidden="true" />
            <span>{t('revokeOthersButton')}</span>
          </Button>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-field bg-paper-deep p-4 text-sm text-ink-soft">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-field border border-line">
          {sessions.map((session) => {
            const DeviceIcon = DEVICE_ICONS[session.device.deviceType];
            const deviceLabel =
              session.device.browser && session.device.os
                ? t('deviceWithOs', { browser: session.device.browser, os: session.device.os })
                : (session.device.browser ?? session.device.os ?? t('unknownDevice'));
            const isBusy = revokingToken === session.token;

            return (
              <li
                key={session.id}
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full',
                      session.isCurrent ? 'bg-soft text-soft-ink' : 'bg-paper-deep text-ink-soft',
                    )}
                  >
                    <DeviceIcon aria-hidden="true" className="size-5" />
                  </span>

                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn('font-semibold text-ink', portal ? 'text-base' : 'text-sm')}
                      >
                        {deviceLabel}
                      </span>
                      {session.isCurrent ? (
                        <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-semibold text-soft-ink">
                          {t('currentBadge')}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-soft tabular-nums',
                        portal ? 'text-sm' : 'text-[13px]',
                      )}
                    >
                      <span>
                        {t('lastActive', { date: formatDateTime(new Date(session.updatedAt)) })}
                      </span>
                      {session.ipAddress ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{session.ipAddress}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {!session.isCurrent ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size={portal ? 'lg' : 'sm'}
                    disabled={isBusy || revokingOthers}
                    onClick={() => handleRevokeOne(session.token)}
                    className="self-start sm:self-center"
                  >
                    {isBusy ? (
                      <Loader2Icon aria-hidden="true" className="animate-spin" />
                    ) : (
                      <LogOutIcon aria-hidden="true" />
                    )}
                    <span>{t('revokeOne')}</span>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ResponsiveSheet
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title={t('confirmOthersTitle', { count: otherSessions.length })}
        description={t('confirmOthersBody')}
        closeLabel={t('cancel')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              size={portal ? 'lg' : 'default'}
              disabled={revokingOthers}
              onClick={() => setConfirmOthers(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size={portal ? 'lg' : 'default'}
              disabled={revokingOthers}
              onClick={handleRevokeOthers}
            >
              {revokingOthers ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
              <span>{t('confirmOthersAction')}</span>
            </Button>
          </>
        }
      >
        <p className={cn('text-ink-soft', portal ? 'text-base' : 'text-sm')}>
          {t('confirmOthersHint')}
        </p>
      </ResponsiveSheet>
    </section>
  );
}
