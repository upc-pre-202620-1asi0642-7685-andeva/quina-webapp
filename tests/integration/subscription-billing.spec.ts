import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { DrizzleDailyProcess } from '@/infrastructure/db/collections/drizzle-daily-process';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import { closeDb } from '@/infrastructure/db/connection';
import {
  getSubscriptionPaymentReceipt,
  listSubscriptionPayments,
} from '@/infrastructure/db/queries/subscriptions';
import {
  DrizzleSubscriptionRepository,
  selectSubscription,
} from '@/infrastructure/db/repositories/drizzle-subscription-repository';
import { auditLogs, storeSubscriptions, subscriptionPayments } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { OutboxCollectionsMailer } from '@/infrastructure/email/collections-mailers';
import { LoggedNotificationMailer } from '@/infrastructure/email/logged-notification-mailer';
import { OutboxAuthMailer, type OutboxMail } from '@/infrastructure/email/outbox-auth-mailer';
import { storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

const repo = new DrizzleSubscriptionRepository();

describe('Suscripciones SaaS, Mercado Pago y ciclo de vida (US23, US25, US26)', () => {
  it('resuelve la tienda por mp_preapproval_id con SECURITY DEFINER, aplica pagos idempotentes y protege subscription_payments contra UPDATE/DELETE', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const trialEndsAt = new Date('2026-11-25T04:59:59.999Z'); // 2026-11-24 fin del día en Lima

    // Dejamos la tienda en su prueba Pro de 14 días (US25 crit. 1)
    await withTenant(ctx.storeId, async (tx) => {
      await tx
        .update(storeSubscriptions)
        .set({
          planTier: 'BODEGA_PRO',
          status: 'TRIALING',
          billingInterval: null,
          trialEndsAt,
          currentPeriodEnd: null,
        })
        .where(eq(storeSubscriptions.storeId, ctx.storeId));
    });

    const now = new Date('2026-11-15T15:00:00Z');
    const preapprovalId = `mp_pre_${ctx.storeId.slice(0, 8)}`;

    await repo.recordCheckoutStarted({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      planTier: 'BODEGA_PRO',
      billingInterval: 'MONTHLY',
      amount: '29.00',
      mpPreapprovalId: preapprovalId,
      now,
    });

    // Función SECURITY DEFINER accesible por quina_app sin conocer el store_id de antemano
    expect(await repo.findStoreByPreapprovalId(preapprovalId)).toBe(ctx.storeId);

    // D3: pago aprobado durante la prueba suma 1 mes desde trialEndsAt y pasa a ACTIVE
    const mpPaymentId = `mp_pay_${ctx.storeId.slice(0, 8)}_1`;
    const applied = await repo.applyPayment({
      storeId: ctx.storeId,
      mpPaymentId,
      mpPreapprovalId: preapprovalId,
      planTier: 'BODEGA_PRO',
      billingInterval: 'MONTHLY',
      amount: '29.00',
      currency: 'PEN',
      status: 'APPROVED',
      paidAt: now,
      receiptUrl: 'https://mp.test/receipt/1',
      rawPayload: { payment_method_id: 'card' },
      now,
    });

    expect(applied.status).toBe('APPLIED');
    if (applied.status !== 'APPLIED') throw new Error('Expected APPLIED');
    expect(applied.subscription.status).toBe('ACTIVE');
    expect(applied.subscription.currentPeriodEnd?.toISOString()).toBe('2026-12-25T04:59:59.999Z');

    // Idempotencia ante reenvío del mismo mp_payment_id (US23 crit. 3)
    const duplicate = await repo.applyPayment({
      storeId: ctx.storeId,
      mpPaymentId,
      mpPreapprovalId: preapprovalId,
      planTier: 'BODEGA_PRO',
      billingInterval: 'MONTHLY',
      amount: '29.00',
      currency: 'PEN',
      status: 'APPROVED',
      paidAt: now,
      receiptUrl: 'https://mp.test/receipt/1',
      rawPayload: { payment_method_id: 'card' },
      now,
    });
    expect(duplicate).toEqual({ status: 'DUPLICATE' });

    // Consultas de historial y comprobante (US23 crit. 5 / D4)
    const history = await listSubscriptionPayments(ctx.storeId);
    expect(history).toHaveLength(1);
    const receipt = await getSubscriptionPaymentReceipt(ctx.storeId, applied.paymentId);
    expect(receipt).toMatchObject({
      id: applied.paymentId,
      mpPaymentId,
      planTier: 'BODEGA_PRO',
      billingInterval: 'MONTHLY',
      amount: '29.00',
      status: 'APPROVED',
    });

    // Inmutabilidad de subscription_payments (trg_immutable_subscription_payments)
    await expect(
      withTenant(ctx.storeId, (tx) =>
        tx
          .update(subscriptionPayments)
          .set({ amount: '1.00' })
          .where(eq(subscriptionPayments.id, applied.paymentId)),
      ),
    ).rejects.toThrow();
  });

  it('otorga 5 días hábiles de gracia ante un cobro rechazado y permite cancelar la renovación automática (US23 crit. 4 y 6)', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const friday = new Date('2026-11-13T15:00:00Z'); // Viernes 13 nov en Lima

    const rejected = await repo.applyPayment({
      storeId: ctx.storeId,
      mpPaymentId: `mp_pay_fail_${ctx.storeId.slice(0, 8)}`,
      mpPreapprovalId: `mp_pre_fail_${ctx.storeId.slice(0, 8)}`,
      planTier: 'BODEGA_PRO',
      billingInterval: 'MONTHLY',
      amount: '29.00',
      currency: 'PEN',
      status: 'REJECTED',
      paidAt: null,
      receiptUrl: null,
      rawPayload: { status: 'rejected' },
      now: friday,
    });

    expect(rejected.status).toBe('APPLIED');
    const subInGrace = await withTenant(ctx.storeId, (tx) => selectSubscription(tx, ctx.storeId));
    expect(subInGrace?.status).toBe('PAST_DUE');
    expect(subInGrace?.gracePeriodEndsAt?.toISOString()).toBe('2026-11-21T04:59:59.999Z');
    // Durante la gracia conserva el plan Pro
    expect(PlanLimits.effectiveTier(subInGrace!, new Date('2026-11-19T15:00:00Z'))).toBe(
      'BODEGA_PRO',
    );

    // Cancelar renovación automática (US23 crit. 6)
    const canceled = await repo.cancelAutoRenew({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      now: new Date('2026-11-14T15:00:00Z'),
    });
    expect(canceled.status).toBe('OK');

    const subAfterCancel = await withTenant(ctx.storeId, (tx) =>
      selectSubscription(tx, ctx.storeId),
    );
    expect(subAfterCancel?.cancelAtPeriodEnd).toBe(true);
    expect(subAfterCancel?.mpPreapprovalId).toBeNull();
  });

  it('ejecuta el ciclo de vida diario: aviso 3 días antes del fin de prueba y bajada automática a Casero al vencer prueba, gracia o cancelación (US25 crit. 4, 5, 6)', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const outboxDir = await mkdtemp(path.join(tmpdir(), 'quina-sub-outbox-'));
    const notificationMailer = new LoggedNotificationMailer(new OutboxAuthMailer(outboxDir));

    // Prueba vence el 2026-11-18 en Lima -> el 2026-11-15 faltan 3 días
    await withTenant(ctx.storeId, async (tx) => {
      await tx
        .update(storeSubscriptions)
        .set({
          planTier: 'BODEGA_PRO',
          status: 'TRIALING',
          billingInterval: null,
          trialEndsAt: new Date('2026-11-19T04:59:59.999Z'),
          currentPeriodEnd: null,
        })
        .where(eq(storeSubscriptions.storeId, ctx.storeId));
    });

    const gateway = new DrizzleDailyProcess(
      new NotificationDispatcher(() => new OutboxCollectionsMailer(outboxDir), 0),
      { storeIds: [ctx.storeId], notificationMailer },
    );
    const runDaily = (now: Date) =>
      new RunDailyProcessUseCase(gateway).execute({ now, budgetMs: 30_000 });

    // Día 15 nov (faltan 3 días): envía correo trial_ending una sola vez
    const summaryWarn = await runDaily(new Date('2026-11-15T15:00:00Z'));
    expect(summaryWarn.errors).toEqual([]);
    await runDaily(new Date('2026-11-16T15:00:00Z')); // Reintento al día siguiente: no duplica

    const files = (await readdir(outboxDir)).filter((f) => f.includes('subscription-trial_ending'));
    expect(files).toHaveLength(1);
    const emailPayload = JSON.parse(
      await readFile(path.join(outboxDir, files[0]!), 'utf8'),
    ) as OutboxMail;
    expect(emailPayload.kind).toBe('subscription-trial_ending');

    // Día 20 nov (prueba ya vencida): baja a CASERO con EXPIRE_TRIAL
    await runDaily(new Date('2026-11-20T15:00:00Z'));
    const afterTrial = await withTenant(ctx.storeId, (tx) => selectSubscription(tx, ctx.storeId));
    expect(afterTrial?.planTier).toBe('CASERO');
    expect(afterTrial?.status).toBe('ACTIVE');

    // Ahora simulamos gracia vencida (PAST_DUE) -> baja a CASERO con EXPIRE_GRACE_PERIOD
    await withTenant(ctx.storeId, async (tx) => {
      await tx
        .update(storeSubscriptions)
        .set({
          planTier: 'BODEGA_PRO',
          status: 'PAST_DUE',
          billingInterval: 'MONTHLY',
          gracePeriodEndsAt: new Date('2026-11-21T04:59:59.999Z'),
        })
        .where(eq(storeSubscriptions.storeId, ctx.storeId));
    });
    await runDaily(new Date('2026-11-22T15:00:00Z'));
    const afterGrace = await withTenant(ctx.storeId, (tx) => selectSubscription(tx, ctx.storeId));
    expect(afterGrace?.planTier).toBe('CASERO');
    expect(afterGrace?.status).toBe('ACTIVE');

    // Ahora simulamos suscripción con cancel_at_period_end vencida -> COMPLETE_CANCELED_SUBSCRIPTION
    await withTenant(ctx.storeId, async (tx) => {
      await tx
        .update(storeSubscriptions)
        .set({
          planTier: 'NEGOCIO_PLUS',
          status: 'ACTIVE',
          billingInterval: 'YEARLY',
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date('2026-12-01T04:59:59.999Z'),
        })
        .where(eq(storeSubscriptions.storeId, ctx.storeId));
    });
    await runDaily(new Date('2026-12-02T15:00:00Z'));
    const afterCanceledEnd = await withTenant(ctx.storeId, (tx) =>
      selectSubscription(tx, ctx.storeId),
    );
    expect(afterCanceledEnd?.planTier).toBe('CASERO');
    expect(afterCanceledEnd?.cancelAtPeriodEnd).toBe(false);

    const audits = await withTenant(ctx.storeId, (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.storeId, ctx.storeId)),
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain('EXPIRE_TRIAL');
    expect(actions).toContain('EXPIRE_GRACE_PERIOD');
    expect(actions).toContain('COMPLETE_CANCELED_SUBSCRIPTION');
  });
});
