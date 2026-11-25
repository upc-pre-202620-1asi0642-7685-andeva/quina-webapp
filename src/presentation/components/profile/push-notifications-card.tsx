'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BellOffIcon, BellRingIcon, Loader2Icon, SendIcon, SmartphoneIcon } from 'lucide-react';
import { sileo } from 'sileo';
import {
  readBrowserPushState,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
  type BrowserPushState,
} from '@/presentation/components/pwa/push-client';
import { Button } from '@/presentation/components/ui/button';
import { cn } from '@/presentation/lib/utils';

type ServerPushState = {
  configured: boolean;
  vapidPublicKey: string | null;
  activeCount: number;
};

async function fetchPushState(): Promise<{
  server: ServerPushState | null;
  browser: BrowserPushState | null;
}> {
  try {
    const [res, browser] = await Promise.all([
      fetch('/app/api/push/subscription', { cache: 'no-store' }),
      readBrowserPushState(),
    ]);
    const server = res.ok ? ((await res.json()) as ServerPushState) : null;
    return { server, browser };
  } catch {
    return { server: null, browser: await readBrowserPushState().catch(() => null) };
  }
}

export function PushNotificationsCard() {
  const t = useTranslations('Profile.push');
  const [server, setServer] = useState<ServerPushState | null>(null);
  const [browser, setBrowser] = useState<BrowserPushState | null>(null);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPushState();
      if (next.server) setServer(next.server);
      setBrowser(next.browser);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPushState()
      .then((next) => {
        if (!active) return;
        if (next.server) setServer(next.server);
        setBrowser(next.browser);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleEnable() {
    if (!server?.vapidPublicKey) {
      sileo.error({ title: t('notConfiguredError') });
      return;
    }
    setWorking(true);
    try {
      const result = await subscribeBrowserPush(server.vapidPublicKey);
      if (result.ok) {
        sileo.success({ title: t('enabledToast') });
        await refresh();
        return;
      }
      if (result.reason === 'denied') {
        sileo.error({ title: t('deniedToast') });
      } else if (result.reason === 'unsupported') {
        sileo.error({ title: t('unsupportedToast') });
      } else {
        sileo.error({ title: t('enableError') });
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  }

  async function handleDisable() {
    setWorking(true);
    try {
      const ok = await unsubscribeBrowserPush();
      if (ok) {
        sileo.success({ title: t('disabledToast') });
      } else {
        sileo.error({ title: t('disableError') });
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch('/app/api/push/test', { method: 'POST' });
      if (res.ok) {
        sileo.success({ title: t('testSent') });
      } else {
        sileo.error({ title: t('testError') });
      }
    } catch {
      sileo.error({ title: t('testError') });
    } finally {
      setTesting(false);
    }
  }

  const loading = checking;
  const subscribed = Boolean(browser?.subscribedOnThisDevice);
  const blocked = browser?.permission === 'denied';
  const needsHomeScreen = browser?.support === 'needs-home-screen';
  const unsupported = !checking && (!browser || browser.support === 'unsupported');
  const serverUnavailable = !checking && server === null;
  const missingVapid = server !== null && (!server.configured || !server.vapidPublicKey);

  let statusLabel = t('statusOff');
  let statusClass = 'bg-paper-deep text-ink-soft';
  if (loading) {
    statusLabel = t('statusChecking');
  } else if (subscribed) {
    statusLabel = t('statusOn');
    statusClass = 'bg-soft text-soft-ink';
  } else if (blocked) {
    statusLabel = t('statusBlocked');
    statusClass = 'bg-error/12 text-error-ink';
  } else if (needsHomeScreen) {
    statusLabel = t('statusNeedsInstall');
    statusClass = 'bg-amber/12 text-amber-ink';
  } else if (unsupported || missingVapid || serverUnavailable) {
    statusLabel = t('statusUnavailable');
  }

  const canSubscribe =
    !loading &&
    !subscribed &&
    !blocked &&
    !needsHomeScreen &&
    !unsupported &&
    !missingVapid &&
    !serverUnavailable;

  return (
    <section
      aria-labelledby="profile-push-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full',
              subscribed ? 'bg-soft text-soft-ink' : 'bg-paper-deep text-ink-soft',
            )}
          >
            {subscribed ? (
              <BellRingIcon aria-hidden="true" className="size-5" />
            ) : (
              <BellOffIcon aria-hidden="true" className="size-5" />
            )}
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="profile-push-title" className="text-lg font-semibold text-ink">
                {t('title')}
              </h2>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusClass)}>
                {statusLabel}
              </span>
            </div>
            <p className="text-sm text-ink-soft">{t('description')}</p>
            {server && server.activeCount > 0 ? (
              <p className="text-xs text-ink-soft tabular-nums">
                {t('devicesCount', { count: server.activeCount })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
          {subscribed ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={testing || working}
                onClick={handleTest}
                className="w-full sm:w-auto"
              >
                {testing ? (
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                ) : (
                  <SendIcon aria-hidden="true" />
                )}
                <span>{t('testButton')}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={working || testing}
                onClick={handleDisable}
                className="w-full sm:w-auto"
              >
                {working ? (
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                ) : (
                  <BellOffIcon aria-hidden="true" />
                )}
                <span>{t('disableButton')}</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={!canSubscribe || working}
              onClick={handleEnable}
              className="w-full sm:w-auto"
            >
              {working ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <BellRingIcon aria-hidden="true" />
              )}
              <span>{t('enableButton')}</span>
            </Button>
          )}
        </div>
      </div>

      {needsHomeScreen ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-field border border-amber/40 bg-amber/12 px-3.5 py-2.5 text-xs text-amber-ink"
        >
          <SmartphoneIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{t('iosHomeScreenHint')}</span>
        </div>
      ) : blocked ? (
        <p role="status" className="text-xs text-error-ink">
          {t('blockedHint')}
        </p>
      ) : unsupported ? (
        <p role="status" className="text-xs text-ink-soft">
          {t('unsupportedHint')}
        </p>
      ) : missingVapid ? (
        <p role="status" className="text-xs text-ink-soft">
          {t('missingVapidHint')}
        </p>
      ) : serverUnavailable ? (
        <p role="status" className="text-xs text-ink-soft">
          {t('enableError')}
        </p>
      ) : null}
    </section>
  );
}
