'use client';

export type BrowserPushSupport = 'supported' | 'needs-home-screen' | 'unsupported';

export type BrowserPushState = {
  support: BrowserPushSupport;
  permission: NotificationPermission | 'unsupported';
  subscribedOnThisDevice: boolean;
  endpoint: string | null;
};

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
  );
}

export function detectBrowserPushSupport(): BrowserPushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIosDevice() && !isStandaloneDisplay()) {
    return 'needs-home-screen';
  }
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  return 'supported';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function readBrowserPushState(): Promise<BrowserPushState> {
  const support = detectBrowserPushSupport();
  if (support !== 'supported') {
    return {
      support,
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
      subscribedOnThisDevice: false,
      endpoint: null,
    };
  }

  const registration = await navigator.serviceWorker.getRegistration('/app');
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  return {
    support,
    permission: Notification.permission,
    subscribedOnThisDevice: Boolean(subscription),
    endpoint: subscription?.endpoint ?? null,
  };
}

export type SubscribePushResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'dismissed' | 'failed' };

export async function subscribeBrowserPush(vapidPublicKey: string): Promise<SubscribePushResult> {
  if (detectBrowserPushSupport() !== 'supported') {
    return { ok: false, reason: 'unsupported' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission === 'denied') return { ok: false, reason: 'denied' };
  if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

  try {
    const registration = await navigator.serviceWorker.register('/app/sw.js', { scope: '/app' });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return { ok: false, reason: 'failed' };
    }

    const res = await fetch('/app/api/push/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
    });
    if (!res.ok) return { ok: false, reason: 'failed' };

    return { ok: true, endpoint };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function unsubscribeBrowserPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return true;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/app');
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    const res = await fetch('/app/api/push/subscription', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    await subscription.unsubscribe();
    return res.ok;
  } catch {
    return false;
  }
}

/** Limpia la suscripción push al cerrar sesión para no dejar avisos en un celular compartido. */
export async function unsubscribePushOnSignOut(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await Promise.race([
      unsubscribeBrowserPush(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 1_500);
      }),
    ]);
  } catch {
    // Nunca bloquea el cierre de sesión
  }
}
