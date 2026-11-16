export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export type ParsedUserAgent = {
  browser: string | null;
  os: string | null;
  deviceType: DeviceType;
};

/** Analiza la cabecera User-Agent para mostrar el dispositivo en sesiones activas. */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || !ua.trim()) {
    return { browser: null, os: null, deviceType: 'desktop' };
  }

  let browser: string | null = null;
  if (/EdgA?\/|EdgiOS\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/FxiOS\/|Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|Chromium\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome|Chromium/i.test(ua)) browser = 'Safari';

  let os: string | null = null;
  let deviceType: DeviceType = 'desktop';

  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    deviceType = 'tablet';
    os = /iPad/i.test(ua) ? 'iPadOS' : 'Android';
  } else if (/iPhone|iPod/i.test(ua)) {
    deviceType = 'mobile';
    os = 'iOS';
  } else if (/Android/i.test(ua)) {
    deviceType = 'mobile';
    os = 'Android';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    os = 'macOS';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  return { browser, os, deviceType };
}
