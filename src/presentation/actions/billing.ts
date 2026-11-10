'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CancelSubscriptionRenewalUseCase,
  ProcessSubscriptionWebhookUseCase,
  StartSubscriptionCheckoutUseCase,
} from '@/core/application/billing/manage-subscription';
import {
  BILLING_INTERVALS,
  PAID_PLAN_TIERS,
  type BillingInterval,
  type PaidPlanTier,
} from '@/core/domain/billing/plan-limits';
import { DrizzleSubscriptionRepository } from '@/infrastructure/db/repositories/drizzle-subscription-repository';
import { getNotificationMailer } from '@/infrastructure/email/auth-mailer-factory';
import {
  encodeLocalPaymentId,
  getSubscriptionGateway,
  isLocalMpTransport,
} from '@/infrastructure/payments/mercado-pago-subscription-gateway';
import { authorizeStore } from '@/presentation/auth/guards';

const checkoutSchema = z.object({
  planTier: z.enum(PAID_PLAN_TIERS),
  billingInterval: z.enum(BILLING_INTERVALS),
});

export type CheckoutActionResult =
  { ok: true; checkoutUrl: string } | { ok: false; error: 'SESSION' | 'INVALID' | 'GENERIC' };

export async function startSubscriptionCheckoutAction(input: {
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
}): Promise<CheckoutActionResult> {
  const user = await authorizeStore('settings.billing', { allowWhenReadOnly: true });
  if (!user) return { ok: false, error: 'SESSION' };
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };

  try {
    const appUrl = (process.env.APP_URL || 'http://localhost:3000/app').replace(/\/$/, '');
    const result = await new StartSubscriptionCheckoutUseCase(
      new DrizzleSubscriptionRepository(),
      getSubscriptionGateway(),
    ).execute({
      storeId: user.storeId,
      actorId: user.id,
      planTier: parsed.data.planTier,
      billingInterval: parsed.data.billingInterval,
      appUrl,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: 'GENERIC' };
    return { ok: true, checkoutUrl: result.value.redirectUrl };
  } catch {
    return { ok: false, error: 'GENERIC' };
  }
}

export type CancelRenewalActionResult = { ok: true } | { ok: false; error: 'SESSION' | 'GENERIC' };

export async function cancelSubscriptionRenewalAction(): Promise<CancelRenewalActionResult> {
  const user = await authorizeStore('settings.billing', { allowWhenReadOnly: true });
  if (!user) return { ok: false, error: 'SESSION' };

  try {
    const result = await new CancelSubscriptionRenewalUseCase(
      new DrizzleSubscriptionRepository(),
      getSubscriptionGateway(),
    ).execute({
      storeId: user.storeId,
      actorId: user.id,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: 'GENERIC' };
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'GENERIC' };
  }
}

const simulateSchema = z.object({
  planTier: z.enum(PAID_PLAN_TIERS),
  billingInterval: z.enum(BILLING_INTERVALS),
  outcome: z.enum(['approved', 'rejected']),
  preapprovalId: z.string().max(120).nullable().optional(),
});

export type SimulatePaymentResult =
  | { ok: true; status: 'APPROVED' | 'REJECTED' }
  | { ok: false; error: 'SESSION' | 'INVALID' | 'GENERIC' };

export async function simulateLocalSubscriptionPaymentAction(input: {
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
  outcome: 'approved' | 'rejected';
  preapprovalId?: string | null;
}): Promise<SimulatePaymentResult> {
  const user = await authorizeStore('settings.billing', { allowWhenReadOnly: true });
  if (!user) return { ok: false, error: 'SESSION' };
  if (!isLocalMpTransport()) return { ok: false, error: 'INVALID' };
  const parsed = simulateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };

  try {
    const now = new Date();
    const mpPaymentId = encodeLocalPaymentId({
      uniqueKey: `${user.storeId.slice(0, 8)}-${now.getTime()}`,
      status: parsed.data.outcome === 'approved' ? 'APPROVED' : 'REJECTED',
      paymentMethod: parsed.data.billingInterval === 'YEARLY' ? 'yape' : 'card',
      planTier: parsed.data.planTier,
      billingInterval: parsed.data.billingInterval,
      storeId: user.storeId,
      preapprovalId: parsed.data.preapprovalId ?? null,
      paidAt: now,
    });
    const appUrl = (process.env.APP_URL || 'http://localhost:3000/app').replace(/\/$/, '');
    const outcome = await new ProcessSubscriptionWebhookUseCase(
      new DrizzleSubscriptionRepository(),
      getSubscriptionGateway(),
      getNotificationMailer(),
    ).execute({
      mpPaymentId,
      now,
      appUrl,
    });
    if (outcome.status === 'IGNORED') return { ok: false, error: 'GENERIC' };
    revalidatePath('/settings');
    revalidatePath('/');
    return {
      ok: true,
      status: parsed.data.outcome === 'approved' ? 'APPROVED' : 'REJECTED',
    };
  } catch {
    return { ok: false, error: 'GENERIC' };
  }
}
