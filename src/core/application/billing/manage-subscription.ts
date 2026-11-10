import {
  BILLING_INTERVALS,
  PAID_PLAN_TIERS,
  planPriceFor,
  type BillingInterval,
  type PaidPlanTier,
} from '@/core/domain/billing/plan-limits';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import type {
  SubscriptionGateway,
  SubscriptionPaymentStatus,
} from '@/core/domain/ports/subscription-gateway';
import type { SubscriptionRepository } from '@/core/domain/ports/subscription-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

const PLAN_NAMES: Record<PaidPlanTier, string> = {
  BODEGA_PRO: 'Bodega Pro',
  NEGOCIO_PLUS: 'Negocio Plus',
};

function isPaidPlanTier(value: string): value is PaidPlanTier {
  return (PAID_PLAN_TIERS as readonly string[]).includes(value);
}

function isBillingInterval(value: string): value is BillingInterval {
  return (BILLING_INTERVALS as readonly string[]).includes(value);
}

function trimBaseUrl(appUrl: string): string {
  return appUrl.replace(/\/+$/, '');
}

export type StartCheckoutError = 'INVALID_PLAN' | 'INVALID_INTERVAL' | 'STORE_NOT_FOUND';

export class StartSubscriptionCheckoutUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: SubscriptionGateway,
  ) {}

  async execute(command: {
    storeId: string;
    actorId: string;
    planTier: string;
    billingInterval: string;
    appUrl: string;
    now: Date;
  }): Promise<Result<{ redirectUrl: string; mpPreapprovalId: string | null }, StartCheckoutError>> {
    if (!isPaidPlanTier(command.planTier)) return err('INVALID_PLAN');
    if (!isBillingInterval(command.billingInterval)) return err('INVALID_INTERVAL');

    const context = await this.subscriptions.getContext(command.storeId);
    if (!context) return err('STORE_NOT_FOUND');

    const amount = planPriceFor(command.planTier, command.billingInterval);
    const base = trimBaseUrl(command.appUrl);
    const session = await this.gateway.createCheckout({
      storeId: command.storeId,
      storeName: context.owner.storeName,
      payerEmail: context.owner.email,
      planTier: command.planTier,
      billingInterval: command.billingInterval,
      amount,
      backUrl: `${base}/settings?billing=return`,
      notificationUrl: `${base}/api/webhooks/mercadopago`,
    });

    await this.subscriptions.recordCheckoutStarted({
      storeId: command.storeId,
      actorId: command.actorId,
      planTier: command.planTier,
      billingInterval: command.billingInterval,
      amount,
      mpPreapprovalId: session.mpPreapprovalId,
      now: command.now,
    });

    return ok(session);
  }
}

export type CancelRenewalError = 'NOT_FOUND' | 'NOT_ACTIVE_RECURRING';

export class CancelSubscriptionRenewalUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: SubscriptionGateway,
  ) {}

  async execute(command: {
    storeId: string;
    actorId: string;
    now: Date;
  }): Promise<Result<{ currentPeriodEnd: Date }, CancelRenewalError>> {
    const context = await this.subscriptions.getContext(command.storeId);
    if (!context) return err('NOT_FOUND');
    const { subscription } = context;
    if (
      subscription.planTier === 'CASERO' ||
      (subscription.status !== 'ACTIVE' && subscription.status !== 'PAST_DUE') ||
      subscription.cancelAtPeriodEnd
    ) {
      return err('NOT_ACTIVE_RECURRING');
    }

    if (subscription.mpPreapprovalId) {
      await this.gateway.cancelAutoRenew(subscription.mpPreapprovalId);
    }

    const cancelled = await this.subscriptions.cancelAutoRenew(command);
    if (cancelled.status !== 'OK') return err(cancelled.status);
    return ok({ currentPeriodEnd: cancelled.currentPeriodEnd });
  }
}

export type WebhookProcessOutcome =
  | { status: 'IGNORED' }
  | { status: 'DUPLICATE' }
  | {
      status: 'APPLIED';
      paymentId: string;
      paymentStatus: SubscriptionPaymentStatus;
    };

export class ProcessSubscriptionWebhookUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: SubscriptionGateway,
    private readonly mailer: NotificationMailer,
  ) {}

  async execute(command: {
    mpPaymentId: string;
    appUrl: string;
    now: Date;
  }): Promise<WebhookProcessOutcome> {
    const mpPaymentId = command.mpPaymentId.trim();
    if (!mpPaymentId) return { status: 'IGNORED' };

    const external = await this.gateway.getPayment(mpPaymentId);
    // D5: estados transitorios (pending, in_process) se ignoran sin tocar subscription_payments
    if (!external || external.status === 'PENDING') {
      return { status: 'IGNORED' };
    }

    const storeId =
      external.storeId ??
      (external.mpPreapprovalId
        ? await this.subscriptions.findStoreByPreapprovalId(external.mpPreapprovalId)
        : null);
    if (!storeId) return { status: 'IGNORED' };

    const context = await this.subscriptions.getContext(storeId);
    if (!context) return { status: 'IGNORED' };

    const fallbackTier = isPaidPlanTier(context.subscription.planTier)
      ? context.subscription.planTier
      : null;
    const planTier = external.planTier ?? fallbackTier;
    const billingInterval =
      external.billingInterval ?? context.subscription.billingInterval ?? 'MONTHLY';
    if (!planTier || !isBillingInterval(billingInterval)) {
      return { status: 'IGNORED' };
    }

    let amount: Money;
    try {
      amount = Money.of(external.amount, 'PEN');
    } catch {
      return { status: 'IGNORED' };
    }
    if (!amount.isPositive()) return { status: 'IGNORED' };

    // En pagos aprobados exigimos que el monto cubra el precio oficial del plan
    if (external.status === 'APPROVED') {
      const expected = Money.of(planPriceFor(planTier, billingInterval), 'PEN');
      if (amount.compare(expected) < 0) {
        return { status: 'IGNORED' };
      }
    }

    const applied = await this.subscriptions.applyPayment({
      storeId,
      mpPaymentId: external.mpPaymentId,
      mpPreapprovalId: external.mpPreapprovalId,
      planTier,
      billingInterval,
      amount: amount.toFixed2(),
      currency: 'PEN',
      status: external.status,
      paidAt: external.paidAt ?? (external.status === 'APPROVED' ? command.now : null),
      receiptUrl: external.receiptUrl,
      rawPayload: external.rawPayload,
      now: command.now,
    });

    if (applied.status === 'DUPLICATE') return { status: 'DUPLICATE' };
    if (applied.status === 'STORE_NOT_FOUND') return { status: 'IGNORED' };

    // CRIT-03: si cambió de plan/recurrencia, cancelamos el preapproval anterior en Mercado Pago
    if (applied.oldPreapprovalToCancel) {
      await this.gateway.cancelAutoRenew(applied.oldPreapprovalToCancel).catch(() => undefined);
    }

    const base = trimBaseUrl(command.appUrl);
    const { owner, subscription, paymentId } = applied;
    try {
      if (external.status === 'APPROVED' && subscription.currentPeriodEnd) {
        await this.mailer.sendSubscriptionNotice?.(
          {
            kind: 'payment_approved',
            to: owner.email,
            locale: owner.locale,
            name: owner.name,
            storeName: owner.storeName,
            planName: PLAN_NAMES[planTier],
            amount: `S/ ${amount.toFixed2()}`,
            periodEndDate: BusinessDate.toISO(
              BusinessDate.fromInstant(subscription.currentPeriodEnd),
            ),
            receiptUrl: `${base}/settings/billing/${paymentId}`,
          },
          {
            storeId,
            ...(owner.userId ? { userId: owner.userId } : {}),
            referenceType: 'subscription_payments',
            referenceId: paymentId,
          },
        );
      } else if (
        external.status === 'REJECTED' &&
        subscription.status === 'PAST_DUE' &&
        subscription.gracePeriodEndsAt
      ) {
        await this.mailer.sendSubscriptionNotice?.(
          {
            kind: 'payment_failed',
            to: owner.email,
            locale: owner.locale,
            name: owner.name,
            storeName: owner.storeName,
            graceEndsDate: BusinessDate.toISO(
              BusinessDate.fromInstant(subscription.gracePeriodEndsAt),
            ),
            url: `${base}/settings#plans`,
          },
          {
            storeId,
            ...(owner.userId ? { userId: owner.userId } : {}),
            referenceType: 'subscription_payments',
            referenceId: paymentId,
          },
        );
      }
    } catch {
      // Un fallo de correo nunca revierte un pago o estado de gracia ya asentado
    }

    return {
      status: 'APPLIED',
      paymentId,
      paymentStatus: external.status,
    };
  }
}
