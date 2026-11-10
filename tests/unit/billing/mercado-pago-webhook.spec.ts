import { describe, expect, it } from 'vitest';
import {
  encodeLocalPaymentId,
  isLocalMpTransport,
  LocalSubscriptionGateway,
  parseExternalReference,
  serializeExternalReference,
  signMercadoPagoWebhook,
  verifyMercadoPagoWebhook,
} from '@/infrastructure/payments/mercado-pago-subscription-gateway';

describe('Mercado Pago webhook verification and local gateway (US23 crit. 2)', () => {
  it('verifica la firma HMAC-SHA256 oficial de Mercado Pago y rechaza firmas alteradas o expiradas', () => {
    const secret = 'test-mp-webhook-secret';
    const dataId = '123456789';
    const requestId = 'req-abc-123';
    const headers = signMercadoPagoWebhook({ dataId, requestId, secret });

    expect(
      verifyMercadoPagoWebhook({
        xSignature: headers.xSignature,
        xRequestId: headers.xRequestId,
        dataId,
        env: { NODE_ENV: 'test', MP_WEBHOOK_SECRET: secret },
      }),
    ).toBe(true);

    // Firma manipulada
    expect(
      verifyMercadoPagoWebhook({
        xSignature: headers.xSignature.replace(/v1=[0-9a-f]+/, 'v1=000000'),
        xRequestId: headers.xRequestId,
        dataId,
        env: { NODE_ENV: 'test', MP_WEBHOOK_SECRET: secret },
      }),
    ).toBe(false);

    // Timestamp antiguo (> 5 min)
    const oldHeaders = signMercadoPagoWebhook({
      dataId,
      requestId,
      timestamp: Math.floor(Date.now() / 1000) - 600,
      secret,
    });
    expect(
      verifyMercadoPagoWebhook({
        xSignature: oldHeaders.xSignature,
        xRequestId: oldHeaders.xRequestId,
        dataId,
        env: { NODE_ENV: 'test', MP_WEBHOOK_SECRET: secret },
      }),
    ).toBe(false);
  });

  it('codifica y decodifica pagos en LocalSubscriptionGateway y bloquea MP_TRANSPORT=local en producción', async () => {
    const ref = serializeExternalReference({
      storeId: 'store-99',
      planTier: 'BODEGA_PRO',
      billingInterval: 'YEARLY',
    });
    expect(parseExternalReference(ref)).toEqual({
      storeId: 'store-99',
      planTier: 'BODEGA_PRO',
      billingInterval: 'YEARLY',
    });

    const gateway = new LocalSubscriptionGateway();
    const mpPaymentId = encodeLocalPaymentId({
      uniqueKey: 'u-1',
      status: 'APPROVED',
      paymentMethod: 'yape',
      planTier: 'BODEGA_PRO',
      billingInterval: 'YEARLY',
      storeId: 'store-99',
    });

    const payment = await gateway.getPayment(mpPaymentId);
    expect(payment).toMatchObject({
      mpPaymentId,
      status: 'APPROVED',
      planTier: 'BODEGA_PRO',
      billingInterval: 'YEARLY',
      amount: '279.00',
      storeId: 'store-99',
    });

    expect(() =>
      isLocalMpTransport({
        NODE_ENV: 'production',
        MP_TRANSPORT: 'local',
        VERCEL_ENV: 'production',
      }),
    ).toThrow(/not allowed in production/i);
  });
});
