import { AsyncLocalStorage } from 'node:async_hooks';
import type { Auth } from './auth';

/** 72 h (US14.2): el vecino abre el correo cuando puede. */
export const MAGIC_LINK_TTL_SECONDS = 72 * 60 * 60;

/** `sendMagicLink` deja aquí el token en lugar de mandar un correo propio. */
export const magicLinkToken = new AsyncLocalStorage<{ token?: string }>();

/**
 * Enlace al portal para los correos de cobranza. No apunta al endpoint de
 * verificación sino a `/portal/enter` (D5): los antivirus abren los enlaces y
 * gastarían el token de un solo uso.
 */
export function portalEnterUrl(appUrl: string, token: string, storeId: string): string {
  const url = new URL(`${appUrl.replace(/\/+$/, '')}/portal/enter`);
  url.searchParams.set('token', token);
  url.searchParams.set('to', `/portal/${storeId}`);
  return url.toString();
}

export async function createPortalLink(
  auth: Auth,
  appUrl: string,
  email: string,
  storeId: string,
): Promise<string> {
  const box: { token?: string } = {};
  // `auth.api` no pasa por el límite de tasa del router HTTP: el cron no lo choca
  await magicLinkToken.run(box, () =>
    auth.api.signInMagicLink({ body: { email }, headers: new Headers() }),
  );
  if (!box.token) throw new Error('El enlace mágico no devolvió un token.');
  return portalEnterUrl(appUrl, box.token, storeId);
}
