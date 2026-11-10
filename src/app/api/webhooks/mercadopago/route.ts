import { ProcessSubscriptionWebhookUseCase } from '@/core/application/billing/manage-subscription';
import { DrizzleSubscriptionRepository } from '@/infrastructure/db/repositories/drizzle-subscription-repository';
import { getNotificationMailer } from '@/infrastructure/email/auth-mailer-factory';
import {
  getSubscriptionGateway,
  verifyMercadoPagoWebhook,
} from '@/infrastructure/payments/mercado-pago-subscription-gateway';

type MpWebhookBody = {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  id?: string | number;
};

/**
 * Webhook de Mercado Pago (US23 crit. 2, 3, 4 y docs §11.1):
 * 1. Verifica la firma HMAC-SHA256 (`x-signature` y `x-request-id`) antes de procesar.
 * 2. Consulta el estado real del pago en Mercado Pago (`getPayment`) y aplica idempotencia
 *    por `mp_payment_id` en `subscription_payments`.
 */
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: MpWebhookBody = {};
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      body = JSON.parse(raw) as MpWebhookBody;
    }
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }

  const queryDataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');
  const bodyDataId = body.data?.id !== undefined ? String(body.data.id) : undefined;
  const dataId = queryDataId ?? bodyDataId ?? null;

  if (!dataId) {
    return Response.json({ error: 'missing data.id' }, { status: 400 });
  }

  const valid = verifyMercadoPagoWebhook({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId,
  });
  if (!valid) {
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  }

  const topic =
    body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  const isPaymentTopic =
    !topic ||
    topic === 'payment' ||
    (typeof body.action === 'string' && body.action.startsWith('payment.'));
  if (!isPaymentTopic) {
    return Response.json({ ignored: true });
  }

  const appUrl = (process.env.APP_URL || 'http://localhost:3000/app').replace(/\/$/, '');
  const useCase = new ProcessSubscriptionWebhookUseCase(
    new DrizzleSubscriptionRepository(),
    getSubscriptionGateway(),
    getNotificationMailer(),
  );
  const outcome = await useCase.execute({
    mpPaymentId: dataId,
    now: new Date(),
    appUrl,
  });

  if (outcome.status === 'IGNORED') {
    return Response.json({ ignored: true });
  }

  return Response.json(outcome);
}
