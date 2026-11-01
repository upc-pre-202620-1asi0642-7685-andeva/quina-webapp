import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_S = 5 * 60;

/**
 * Firma de Resend (svix / Standard Webhooks, D14): HMAC-SHA256 de
 * `id.timestamp.cuerpo` con el secreto `whsec_…` en base64. Rechaza firmas de
 * hace más de 5 minutos para que no se repitan eventos viejos.
 */
export function verifyResendSignature(input: {
  secret: string | undefined;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: Date;
}): boolean {
  const { secret, id, timestamp, signature, body } = input;
  if (!secret || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isInteger(seconds) || Math.abs(now - seconds) > TOLERANCE_S) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type EmailEvent = {
  storeId: string;
  providerMessageId: string;
  status: 'DELIVERED' | 'BOUNCED';
  at: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Solo interesan la entrega y el rebote de los correos de cobranza, que llevan
 * la etiqueta `store_id`. Cualquier otro evento devuelve `null` y se ignora.
 */
export function emailEventOf(payload: unknown): EmailEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const { type, created_at, data } = payload as {
    type?: unknown;
    created_at?: unknown;
    data?: { email_id?: unknown; tags?: unknown };
  };
  const status =
    type === 'email.delivered' ? 'DELIVERED' : type === 'email.bounced' ? 'BOUNCED' : null;
  if (!status || !data || typeof data.email_id !== 'string') return null;
  const tags =
    data.tags && typeof data.tags === 'object' ? (data.tags as Record<string, unknown>) : {};
  const storeId = tags.store_id;
  if (typeof storeId !== 'string' || !UUID.test(storeId)) return null;
  const at = typeof created_at === 'string' ? new Date(created_at) : new Date();
  return {
    storeId,
    providerMessageId: data.email_id,
    status,
    at: Number.isNaN(at.getTime()) ? new Date() : at,
  };
}
