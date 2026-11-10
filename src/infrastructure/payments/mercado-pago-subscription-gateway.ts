import { createHmac } from 'node:crypto';
import MercadoPagoConfig, {
  Payment,
  PreApproval,
  Preference,
  WebhookSignatureValidator,
} from 'mercadopago';
import {
  BILLING_INTERVALS,
  PAID_PLAN_TIERS,
  planPriceFor,
  type BillingInterval,
  type PaidPlanTier,
} from '@/core/domain/billing/plan-limits';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  ExternalSubscriptionPayment,
  SubscriptionGateway,
  SubscriptionPaymentStatus,
} from '@/core/domain/ports/subscription-gateway';
import { Money } from '@/core/domain/shared/money';

const LOCAL_DEFAULT_SECRET = 'local-mp-webhook-secret';

export type ParsedExternalReference = {
  storeId: string;
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
};

export function serializeExternalReference(ref: ParsedExternalReference): string {
  return `quina:${ref.storeId}:${ref.planTier}:${ref.billingInterval}`;
}

export function parseExternalReference(
  raw: string | null | undefined,
): ParsedExternalReference | null {
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length !== 4 || parts[0] !== 'quina') return null;
  const [, storeId, planTier, billingInterval] = parts;
  if (!storeId) return null;
  if (!PAID_PLAN_TIERS.includes(planTier as PaidPlanTier)) return null;
  if (!BILLING_INTERVALS.includes(billingInterval as BillingInterval)) return null;
  return {
    storeId,
    planTier: planTier as PaidPlanTier,
    billingInterval: billingInterval as BillingInterval,
  };
}

function mapMpStatus(status: string | undefined): SubscriptionPaymentStatus | 'PENDING' {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
    case 'cancelled':
      return 'REJECTED';
    case 'refunded':
    case 'charged_back':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
}

export class MercadoPagoSubscriptionGateway implements SubscriptionGateway {
  private readonly config: MercadoPagoConfig;

  constructor(accessToken: string) {
    this.config = new MercadoPagoConfig({ accessToken });
  }

  async createCheckout(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const externalReference = serializeExternalReference({
      storeId: input.storeId,
      planTier: input.planTier,
      billingInterval: input.billingInterval,
    });
    const description = `Quina ${input.planTier} (${input.billingInterval}) - ${input.storeName}`;

    if (input.billingInterval === 'MONTHLY') {
      const preApproval = new PreApproval(this.config);
      const response = await preApproval.create({
        body: {
          reason: description,
          external_reference: externalReference,
          payer_email: input.payerEmail,
          back_url: input.backUrl,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: Number(input.amount),
            currency_id: 'PEN',
          },
        },
      });
      if (!response.init_point) {
        throw new Error('Mercado Pago did not return an init_point for PreApproval');
      }
      return {
        redirectUrl: response.init_point,
        mpPreapprovalId: response.id ?? null,
      };
    }

    const preference = new Preference(this.config);
    const response = await preference.create({
      body: {
        items: [
          {
            id: `${input.planTier}_${input.billingInterval}`,
            title: description,
            quantity: 1,
            currency_id: 'PEN',
            unit_price: Number(input.amount),
          },
        ],
        payer: { email: input.payerEmail },
        external_reference: externalReference,
        back_urls: {
          success: input.backUrl,
          failure: input.backUrl,
          pending: input.backUrl,
        },
        auto_return: 'approved',
        notification_url: input.notificationUrl,
      },
    });
    if (!response.init_point) {
      throw new Error('Mercado Pago did not return an init_point for Preference');
    }
    return {
      redirectUrl: response.init_point,
      mpPreapprovalId: null,
    };
  }

  async cancelAutoRenew(mpPreapprovalId: string): Promise<void> {
    const preApproval = new PreApproval(this.config);
    await preApproval.update({
      id: mpPreapprovalId,
      body: { status: 'cancelled' },
    });
  }

  async getPayment(mpPaymentId: string): Promise<ExternalSubscriptionPayment | null> {
    const payment = new Payment(this.config);
    try {
      const res = await payment.get({ id: mpPaymentId });
      if (!res || !res.id) return null;
      const amount = Money.of((res.transaction_amount ?? 0).toFixed(2), 'PEN').toFixed2();
      const rawRecord = res as unknown as Record<string, unknown>;
      const mpPreapprovalId =
        typeof rawRecord.preapproval_id === 'string' && rawRecord.preapproval_id.length > 0
          ? rawRecord.preapproval_id
          : null;
      const parsedRef = parseExternalReference(res.external_reference);
      return {
        mpPaymentId: String(res.id),
        mpPreapprovalId,
        storeId: parsedRef?.storeId ?? null,
        planTier: parsedRef?.planTier ?? null,
        billingInterval: parsedRef?.billingInterval ?? null,
        amount,
        currency: 'PEN',
        status: mapMpStatus(res.status),
        paidAt: res.date_approved
          ? new Date(res.date_approved)
          : res.date_created
            ? new Date(res.date_created)
            : new Date(),
        receiptUrl: res.transaction_details?.external_resource_url ?? null,
        rawPayload: {
          payment_method_id: res.payment_method_id ?? 'card',
          status: res.status ?? null,
          external_reference: res.external_reference ?? null,
        },
      };
    } catch {
      return null;
    }
  }
}

const globalForLocalPayments = globalThis as unknown as {
  __quinaLocalPayments?: Map<string, ExternalSubscriptionPayment>;
};

const localPaymentsStore =
  globalForLocalPayments.__quinaLocalPayments ??
  (globalForLocalPayments.__quinaLocalPayments = new Map<string, ExternalSubscriptionPayment>());

export function registerLocalPayment(payment: ExternalSubscriptionPayment): void {
  localPaymentsStore.set(payment.mpPaymentId, payment);
}

export function encodeLocalPaymentId(input: {
  uniqueKey: string;
  status: SubscriptionPaymentStatus | 'PENDING';
  paymentMethod: 'yape' | 'card';
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
  storeId?: string | null;
  preapprovalId?: string | null;
  paidAt?: Date;
}): string {
  const amount = planPriceFor(input.planTier, input.billingInterval);
  const statusChar =
    input.status === 'APPROVED'
      ? 'A'
      : input.status === 'REJECTED'
        ? 'R'
        : input.status === 'REFUNDED'
          ? 'F'
          : 'P';
  const methodChar = input.paymentMethod === 'yape' ? 'Y' : 'C';
  const planChar = input.planTier === 'BODEGA_PRO' ? 'P' : 'N';
  const intervalChar = input.billingInterval === 'YEARLY' ? 'Y' : 'M';
  const preFlag = input.preapprovalId ? '1' : '0';
  const shortKey = input.uniqueKey.replace(/[^a-zA-Z0-9-]/g, '').slice(-16);
  const storePart = input.storeId ?? 'none';
  // Formato compacto (< 80 caracteres) compatible con VARCHAR(100) en subscription_payments.mp_payment_id
  const mpPaymentId = `local_pay_${shortKey}_${statusChar}${methodChar}${planChar}${intervalChar}${preFlag}_${storePart}`;
  const paidAt = input.paidAt ?? new Date();

  registerLocalPayment({
    mpPaymentId,
    mpPreapprovalId: input.preapprovalId ?? null,
    storeId: input.storeId ?? null,
    planTier: input.planTier,
    billingInterval: input.billingInterval,
    amount,
    currency: 'PEN',
    status: input.status,
    paidAt,
    receiptUrl: null,
    rawPayload: {
      payment_method_id: input.paymentMethod,
      status: input.status.toLowerCase(),
      local: true,
    },
  });
  return mpPaymentId;
}

function decodeLocalPaymentId(mpPaymentId: string): ExternalSubscriptionPayment | null {
  const fromMemory = localPaymentsStore.get(mpPaymentId);
  if (fromMemory) return fromMemory;
  const match = /^local_pay_([a-zA-Z0-9-]+)_([ARFP])([YC])([PN])([MY])([01])_(.+)$/.exec(
    mpPaymentId,
  );
  if (!match) return null;
  const [, , statusChar, methodChar, planChar, intervalChar, preFlag, storePart] = match;
  const status: SubscriptionPaymentStatus | 'PENDING' =
    statusChar === 'A'
      ? 'APPROVED'
      : statusChar === 'R'
        ? 'REJECTED'
        : statusChar === 'F'
          ? 'REFUNDED'
          : 'PENDING';
  const paymentMethod = methodChar === 'Y' ? 'yape' : 'card';
  const planTier: PaidPlanTier = planChar === 'P' ? 'BODEGA_PRO' : 'NEGOCIO_PLUS';
  const billingInterval: BillingInterval = intervalChar === 'Y' ? 'YEARLY' : 'MONTHLY';
  const storeId = storePart === 'none' ? null : (storePart ?? null);
  const mpPreapprovalId =
    preFlag === '1' && storeId
      ? `local_pre_${storeId.slice(0, 8)}_${planTier.toLowerCase()}`
      : null;
  const amount = planPriceFor(planTier, billingInterval);

  return {
    mpPaymentId,
    mpPreapprovalId,
    storeId,
    planTier,
    billingInterval,
    amount,
    currency: 'PEN',
    status,
    paidAt: new Date(),
    receiptUrl: null,
    rawPayload: {
      payment_method_id: paymentMethod,
      status: status.toLowerCase(),
      local: true,
    },
  };
}

export class LocalSubscriptionGateway implements SubscriptionGateway {
  async createCheckout(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const mpPreapprovalId =
      input.billingInterval === 'MONTHLY'
        ? `local_pre_${input.storeId.slice(0, 8)}_${input.planTier.toLowerCase()}`
        : null;
    const url = new URL(input.backUrl);
    url.searchParams.set('mp_checkout', 'local');
    url.searchParams.set('plan', input.planTier);
    url.searchParams.set('interval', input.billingInterval);
    if (mpPreapprovalId) {
      url.searchParams.set('preapproval_id', mpPreapprovalId);
    }
    url.hash = 'plans';
    return {
      redirectUrl: url.toString(),
      mpPreapprovalId,
    };
  }

  async cancelAutoRenew(): Promise<void> {
    // No-op en transporte local
  }

  async getPayment(mpPaymentId: string): Promise<ExternalSubscriptionPayment | null> {
    return decodeLocalPaymentId(mpPaymentId);
  }
}

export function isLocalMpTransport(env: NodeJS.ProcessEnv = process.env): boolean {
  const transport = env.MP_TRANSPORT || (env.MP_ACCESS_TOKEN ? 'mercadopago' : 'local');
  if (transport === 'local') {
    if (env.VERCEL_ENV === 'production') {
      throw new Error('MP_TRANSPORT=local is not allowed in production');
    }
    return true;
  }
  return false;
}

export function getSubscriptionGateway(env: NodeJS.ProcessEnv = process.env): SubscriptionGateway {
  if (isLocalMpTransport(env)) {
    return new LocalSubscriptionGateway();
  }
  if (!env.MP_ACCESS_TOKEN) {
    throw new Error('MP_ACCESS_TOKEN is required when MP_TRANSPORT=mercadopago');
  }
  return new MercadoPagoSubscriptionGateway(env.MP_ACCESS_TOKEN);
}

export function getWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MP_WEBHOOK_SECRET) return env.MP_WEBHOOK_SECRET;
  if (env.VERCEL_ENV === 'production') {
    throw new Error('MP_WEBHOOK_SECRET is required in production');
  }
  return LOCAL_DEFAULT_SECRET;
}

export function signMercadoPagoWebhook(options: {
  dataId: string;
  requestId: string;
  timestamp?: number;
  secret?: string;
}): { xSignature: string; xRequestId: string } {
  const ts = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const secret = options.secret ?? getWebhookSecret();
  const manifest = `id:${options.dataId.toLowerCase()};request-id:${options.requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return {
    xSignature: `ts=${ts},v1=${v1}`,
    xRequestId: options.requestId,
  };
}

export function verifyMercadoPagoWebhook(options: {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): boolean {
  try {
    const secret = getWebhookSecret(options.env);
    WebhookSignatureValidator.validate({
      xSignature: options.xSignature,
      xRequestId: options.xRequestId,
      dataId: options.dataId,
      secret,
      toleranceSeconds: 300,
    });
    return true;
  } catch {
    return false;
  }
}
