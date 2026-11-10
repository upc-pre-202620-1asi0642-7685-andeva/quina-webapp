import { describe, expect, it } from 'vitest';
import {
  CancelSubscriptionRenewalUseCase,
  ProcessSubscriptionWebhookUseCase,
  StartSubscriptionCheckoutUseCase,
} from '@/core/application/billing/manage-subscription';
import { PlanLimits, type Subscription } from '@/core/domain/billing/plan-limits';
import type {
  MailContext,
  NotificationMailer,
  SubscriptionNoticeInput,
} from '@/core/domain/ports/notification-mailer';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  ExternalSubscriptionPayment,
  SubscriptionGateway,
} from '@/core/domain/ports/subscription-gateway';
import type {
  ApplySubscriptionPaymentData,
  ApplySubscriptionPaymentResult,
  CancelAutoRenewResult,
  StoreSubscriptionContext,
  SubscriptionRepository,
} from '@/core/domain/ports/subscription-repository';

class FakeSubscriptionRepository implements SubscriptionRepository {
  storeId = 'store-1';
  context: StoreSubscriptionContext = {
    subscriptionId: 'sub-1',
    subscription: {
      planTier: 'BODEGA_PRO',
      status: 'TRIALING',
      billingInterval: null,
      trialEndsAt: new Date('2026-11-25T04:59:59.999Z'),
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      mpPreapprovalId: null,
      cancelAtPeriodEnd: false,
    },
    owner: {
      userId: 'owner-1',
      name: 'Lucho Pérez',
      email: 'lucho@example.test',
      locale: 'es',
      storeName: 'Bodega Don Lucho',
    },
  };
  seenPaymentIds = new Set<string>();
  appliedPayments: ApplySubscriptionPaymentData[] = [];

  async findStoreByPreapprovalId(preapprovalId: string): Promise<string | null> {
    return this.context.subscription.mpPreapprovalId === preapprovalId ? this.storeId : null;
  }

  async getContext(storeId: string): Promise<StoreSubscriptionContext | null> {
    return storeId === this.storeId
      ? {
          ...this.context,
          subscription: { ...this.context.subscription },
          owner: { ...this.context.owner },
        }
      : null;
  }

  async recordCheckoutStarted(data: {
    storeId: string;
    actorId: string;
    planTier: 'BODEGA_PRO' | 'NEGOCIO_PLUS';
    billingInterval: 'MONTHLY' | 'YEARLY';
    amount: string;
    mpPreapprovalId: string | null;
    now: Date;
  }): Promise<void> {
    if (
      data.storeId === this.storeId &&
      data.mpPreapprovalId &&
      !this.context.subscription.mpPreapprovalId
    ) {
      this.context.subscription.mpPreapprovalId = data.mpPreapprovalId;
    }
  }

  async applyPayment(data: ApplySubscriptionPaymentData): Promise<ApplySubscriptionPaymentResult> {
    if (data.storeId !== this.storeId) return { status: 'STORE_NOT_FOUND' };
    if (this.seenPaymentIds.has(data.mpPaymentId)) return { status: 'DUPLICATE' };
    this.seenPaymentIds.add(data.mpPaymentId);
    this.appliedPayments.push(data);

    const prev = this.context.subscription;
    let oldPreapprovalToCancel: string | null = null;
    let next: Subscription = { ...prev };

    if (data.status === 'APPROVED') {
      const currentPeriodEnd = PlanLimits.nextPeriodEnd({
        subscription: prev,
        targetTier: data.planTier,
        interval: data.billingInterval,
        now: data.now,
      });
      const nextPreapprovalId =
        data.billingInterval === 'MONTHLY'
          ? (data.mpPreapprovalId ?? prev.mpPreapprovalId ?? null)
          : null;
      if (prev.mpPreapprovalId && prev.mpPreapprovalId !== nextPreapprovalId) {
        oldPreapprovalToCancel = prev.mpPreapprovalId;
      }
      next = {
        ...prev,
        planTier: data.planTier,
        status: 'ACTIVE',
        billingInterval: data.billingInterval,
        currentPeriodEnd,
        gracePeriodEndsAt: null,
        mpPreapprovalId: nextPreapprovalId,
        cancelAtPeriodEnd: data.billingInterval === 'YEARLY',
      };
    } else if (data.status === 'REJECTED') {
      next = {
        ...prev,
        status: 'PAST_DUE',
        gracePeriodEndsAt: PlanLimits.gracePeriodEnd(data.now),
      };
    }

    this.context.subscription = next;
    return {
      status: 'APPLIED',
      paymentId: `db-${data.mpPaymentId}`,
      subscription: next,
      oldPreapprovalToCancel,
      owner: this.context.owner,
    };
  }

  async cancelAutoRenew(data: {
    storeId: string;
    actorId: string;
    now: Date;
  }): Promise<CancelAutoRenewResult> {
    if (data.storeId !== this.storeId) return { status: 'NOT_FOUND' };
    const currentPeriodEnd =
      this.context.subscription.currentPeriodEnd ?? new Date('2026-12-15T04:59:59.999Z');
    const mpPreapprovalId = this.context.subscription.mpPreapprovalId ?? null;
    this.context.subscription = {
      ...this.context.subscription,
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
      mpPreapprovalId: null,
    };
    return {
      status: 'OK',
      mpPreapprovalId,
      currentPeriodEnd,
    };
  }
}

class FakeSubscriptionGateway implements SubscriptionGateway {
  canceledPreapprovals: string[] = [];
  payments = new Map<string, ExternalSubscriptionPayment>();
  lastCheckoutInput: CheckoutSessionInput | null = null;

  async createCheckout(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    this.lastCheckoutInput = input;
    return {
      redirectUrl: `https://mp.test/checkout/${input.planTier}/${input.billingInterval}`,
      mpPreapprovalId: input.billingInterval === 'MONTHLY' ? 'mp-pre-new' : null,
    };
  }

  async cancelAutoRenew(mpPreapprovalId: string): Promise<void> {
    this.canceledPreapprovals.push(mpPreapprovalId);
  }

  async getPayment(mpPaymentId: string): Promise<ExternalSubscriptionPayment | null> {
    return this.payments.get(mpPaymentId) ?? null;
  }
}

class FakeMailer implements NotificationMailer {
  notices: Array<{ input: SubscriptionNoticeInput; context: MailContext }> = [];
  async sendCustomerWelcome(): Promise<void> {}
  async sendAccountSetup(): Promise<void> {}
  async sendSubscriptionNotice(
    input: SubscriptionNoticeInput,
    context: MailContext,
  ): Promise<void> {
    this.notices.push({ input, context });
  }
}

describe('Subscription billing use cases (US23, US25, US26)', () => {
  it('inicia el checkout con el precio oficial y cancela el preapproval anterior al confirmar el pago (CRIT-03)', async () => {
    const repo = new FakeSubscriptionRepository();
    repo.context.subscription.mpPreapprovalId = 'mp-pre-old';
    const gateway = new FakeSubscriptionGateway();
    const mailer = new FakeMailer();
    const startUseCase = new StartSubscriptionCheckoutUseCase(repo, gateway);

    const res = await startUseCase.execute({
      storeId: 'store-1',
      actorId: 'owner-1',
      planTier: 'NEGOCIO_PLUS',
      billingInterval: 'YEARLY',
      appUrl: 'http://localhost:3000/app',
      now: new Date('2026-11-15T15:00:00Z'),
    });

    expect(res.ok).toBe(true);
    expect(gateway.lastCheckoutInput?.amount).toBe('660.00');

    // Al confirmarse el pago anual en el webhook, se cancela el preapproval mensual anterior
    gateway.payments.set('pay-annual-1', {
      mpPaymentId: 'pay-annual-1',
      status: 'APPROVED',
      storeId: 'store-1',
      planTier: 'NEGOCIO_PLUS',
      billingInterval: 'YEARLY',
      amount: '660.00',
      currency: 'PEN',
      paidAt: new Date('2026-11-15T15:05:00Z'),
      receiptUrl: null,
      mpPreapprovalId: null,
      rawPayload: { id: 'pay-annual-1' },
    });

    const webhookUseCase = new ProcessSubscriptionWebhookUseCase(repo, gateway, mailer);
    const outcome = await webhookUseCase.execute({
      mpPaymentId: 'pay-annual-1',
      appUrl: 'http://localhost:3000/app',
      now: new Date('2026-11-15T15:05:00Z'),
    });

    expect(outcome).toEqual({
      status: 'APPLIED',
      paymentId: 'db-pay-annual-1',
      paymentStatus: 'APPROVED',
    });
    expect(gateway.canceledPreapprovals).toEqual(['mp-pre-old']);
  });

  it('D3: al pagar Bodega Pro durante la prueba de 14 días, suma el mes desde trialEndsAt y pasa a ACTIVE', async () => {
    const repo = new FakeSubscriptionRepository();
    const gateway = new FakeSubscriptionGateway();
    const mailer = new FakeMailer();
    gateway.payments.set('pay-101', {
      mpPaymentId: 'pay-101',
      status: 'APPROVED',
      storeId: 'store-1',
      planTier: 'BODEGA_PRO',
      billingInterval: 'MONTHLY',
      amount: '29.00',
      currency: 'PEN',
      paidAt: new Date('2026-11-15T15:00:00Z'),
      receiptUrl: 'https://mp.test/receipt/101',
      mpPreapprovalId: 'mp-pre-101',
      rawPayload: { id: 'pay-101' },
    });

    const useCase = new ProcessSubscriptionWebhookUseCase(repo, gateway, mailer);
    const now = new Date('2026-11-15T15:00:00Z');
    const result = await useCase.execute({
      mpPaymentId: 'pay-101',
      now,
      appUrl: 'http://localhost:3000/app',
    });

    expect(result).toEqual({
      status: 'APPLIED',
      paymentId: 'db-pay-101',
      paymentStatus: 'APPROVED',
    });
    expect(repo.context.subscription.status).toBe('ACTIVE');
    expect(repo.context.subscription.planTier).toBe('BODEGA_PRO');
    // trialEndsAt era 2026-11-24 en Lima -> +1 mes termina el 2026-12-24 al fin del día en Lima
    expect(repo.context.subscription.currentPeriodEnd?.toISOString()).toBe(
      '2026-12-25T04:59:59.999Z',
    );
    expect(mailer.notices).toHaveLength(1);
    expect(mailer.notices[0]?.input.kind).toBe('payment_approved');

    // Idempotencia ante reenvío del mismo mp_payment_id (US23 crit. 3)
    const duplicate = await useCase.execute({
      mpPaymentId: 'pay-101',
      now,
      appUrl: 'http://localhost:3000/app',
    });
    expect(duplicate).toEqual({ status: 'DUPLICATE' });
    expect(mailer.notices).toHaveLength(1);
  });

  it('US23 crit. 4: al rechazarse un pago marca PAST_DUE con 5 días hábiles de gracia y avisa por correo', async () => {
    const repo = new FakeSubscriptionRepository();
    repo.context.subscription.status = 'ACTIVE';
    repo.context.subscription.billingInterval = 'MONTHLY';
    repo.context.subscription.mpPreapprovalId = 'mp-pre-recurring';
    const gateway = new FakeSubscriptionGateway();
    const mailer = new FakeMailer();

    // Cobro recurrente automático sin external_reference (solo mpPreapprovalId)
    gateway.payments.set('pay-fail-1', {
      mpPaymentId: 'pay-fail-1',
      status: 'REJECTED',
      storeId: null,
      planTier: null,
      billingInterval: null,
      amount: '29.00',
      currency: 'PEN',
      paidAt: new Date('2026-11-13T15:00:00Z'),
      receiptUrl: null,
      mpPreapprovalId: 'mp-pre-recurring',
      rawPayload: { id: 'pay-fail-1' },
    });

    const useCase = new ProcessSubscriptionWebhookUseCase(repo, gateway, mailer);
    const result = await useCase.execute({
      mpPaymentId: 'pay-fail-1',
      now: new Date('2026-11-13T15:00:00Z'), // Viernes 13 nov
      appUrl: 'http://localhost:3000/app',
    });

    expect(result).toEqual({
      status: 'APPLIED',
      paymentId: 'db-pay-fail-1',
      paymentStatus: 'REJECTED',
    });
    expect(repo.context.subscription.status).toBe('PAST_DUE');
    // 5 días hábiles desde viernes 13 nov -> viernes 20 nov 23:59:59.999 Lima
    expect(repo.context.subscription.gracePeriodEndsAt?.toISOString()).toBe(
      '2026-11-21T04:59:59.999Z',
    );
    expect(mailer.notices).toHaveLength(1);
    expect(mailer.notices[0]?.input.kind).toBe('payment_failed');
  });

  it('D5: ignora notificaciones de pagos en estado PENDING sin insertar en subscription_payments', async () => {
    const repo = new FakeSubscriptionRepository();
    const gateway = new FakeSubscriptionGateway();
    const mailer = new FakeMailer();
    gateway.payments.set('pay-pending', {
      mpPaymentId: 'pay-pending',
      status: 'PENDING',
      storeId: 'store-1',
      planTier: 'BODEGA_PRO',
      billingInterval: 'YEARLY',
      amount: '279.00',
      currency: 'PEN',
      paidAt: null,
      receiptUrl: null,
      mpPreapprovalId: null,
      rawPayload: { id: 'pay-pending' },
    });

    const useCase = new ProcessSubscriptionWebhookUseCase(repo, gateway, mailer);
    const result = await useCase.execute({
      mpPaymentId: 'pay-pending',
      now: new Date('2026-11-15T15:00:00Z'),
      appUrl: 'http://localhost:3000/app',
    });

    expect(result).toEqual({ status: 'IGNORED' });
    expect(repo.appliedPayments).toHaveLength(0);
  });

  it('US23 crit. 6: cancela la renovación automática y conserva el plan hasta el fin del periodo', async () => {
    const repo = new FakeSubscriptionRepository();
    repo.context.subscription.status = 'ACTIVE';
    repo.context.subscription.mpPreapprovalId = 'mp-pre-active';
    repo.context.subscription.currentPeriodEnd = new Date('2026-12-15T04:59:59.999Z');
    const gateway = new FakeSubscriptionGateway();

    const useCase = new CancelSubscriptionRenewalUseCase(repo, gateway);
    const res = await useCase.execute({
      storeId: 'store-1',
      actorId: 'owner-1',
      now: new Date('2026-11-15T15:00:00Z'),
    });

    expect(res).toEqual({
      ok: true,
      value: { currentPeriodEnd: new Date('2026-12-15T04:59:59.999Z') },
    });
    expect(gateway.canceledPreapprovals).toEqual(['mp-pre-active']);
    expect(repo.context.subscription.cancelAtPeriodEnd).toBe(true);
    expect(repo.context.subscription.status).toBe('ACTIVE');
  });
});
