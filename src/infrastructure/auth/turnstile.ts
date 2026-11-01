const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Valida un token de Cloudflare Turnstile fuera de Better Auth (portal del vecino,
 * D4). El token es de un solo uso: se valida una vez aunque luego salgan varios
 * códigos. Con la clave de prueba de Cloudflare (desarrollo y e2e) siempre pasa.
 */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const response = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
