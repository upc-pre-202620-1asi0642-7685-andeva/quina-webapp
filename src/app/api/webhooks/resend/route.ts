import { recordEmailEvent } from '@/infrastructure/db/collections/email-events';
import { emailEventOf, verifyResendSignature } from '@/presentation/lib/resend-webhook';

/**
 * Eventos de Resend (D14): entrega y rebote de los correos de cobranza. La firma
 * se verifica antes de leer nada; un evento que no nos toca responde 200 para
 * que Resend no lo reintente.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const valid = verifyResendSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
    body,
  });
  if (!valid) return Response.json({ error: 'invalid signature' }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }
  const event = emailEventOf(payload);
  if (!event) return Response.json({ ignored: true });
  const updated = await recordEmailEvent(event);
  return Response.json({ updated });
}
