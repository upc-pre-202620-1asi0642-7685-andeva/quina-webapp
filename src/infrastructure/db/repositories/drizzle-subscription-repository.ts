import { and, eq, sql } from 'drizzle-orm';
import {
  PlanLimits,
  type BillingInterval,
  type PaidPlanTier,
  type PlanTier,
  type Subscription,
  type SubscriptionStatus,
} from '@/core/domain/billing/plan-limits';
import type {
  ApplySubscriptionPaymentData,
  ApplySubscriptionPaymentResult,
  CancelAutoRenewResult,
  StoreOwnerRecipient,
  StoreSubscriptionContext,
  SubscriptionRepository,
} from '@/core/domain/ports/subscription-repository';
import type { Locale } from '@/core/domain/shared/locale';
import { db, type Database } from '../connection';
import { uniqueViolation } from '../errors';
import { auditLogs, storeSubscriptions, stores, subscriptionPayments, users } from '../schema';
import { withTenant, type Tx } from '../with-tenant';

const PAYMENT_MP_ID_CONSTRAINT = 'subscription_payments_mp_payment_id_unique';
const PREAPPROVAL_CONSTRAINT = 'store_subscriptions_mp_preapproval_id_unique';
const LOCALES: readonly Locale[] = ['es', 'en', 'qu'];

function normalizeLocale(value: string | null | undefined, fallback: Locale = 'es'): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : fallback;
}

/**
 * Lectura canónica de `store_subscriptions` (CRIT-02): trae todos los campos del
 * ciclo de vida para que `PlanLimits.effectiveTier` respete los 5 días hábiles
 * de gracia (`PAST_DUE`) y el fin de ciclo tras cancelación en todas las guardas.
 */
export async function selectSubscription(
  tx: Tx,
  storeId: string,
  options: { forUpdate?: boolean } = {},
): Promise<Subscription | null> {
  const query = tx
    .select({
      planTier: storeSubscriptions.planTier,
      status: storeSubscriptions.status,
      trialEndsAt: storeSubscriptions.trialEndsAt,
      gracePeriodEndsAt: storeSubscriptions.gracePeriodEndsAt,
      currentPeriodEnd: storeSubscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: storeSubscriptions.cancelAtPeriodEnd,
      billingInterval: storeSubscriptions.billingInterval,
      mpPreapprovalId: storeSubscriptions.mpPreapprovalId,
    })
    .from(storeSubscriptions)
    .where(eq(storeSubscriptions.storeId, storeId));

  const [row] = options.forUpdate ? await query.for('update') : await query;
  if (!row) return null;

  return {
    planTier: row.planTier as PlanTier,
    status: row.status as SubscriptionStatus,
    trialEndsAt: row.trialEndsAt,
    gracePeriodEndsAt: row.gracePeriodEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    billingInterval: (row.billingInterval as BillingInterval | null) ?? null,
    mpPreapprovalId: row.mpPreapprovalId,
  };
}

async function loadOwnerRecipient(tx: Tx, storeId: string): Promise<StoreOwnerRecipient | null> {
  const [store] = await tx
    .select({
      commercialName: stores.commercialName,
      ownerFullName: stores.ownerFullName,
      contactEmail: stores.contactEmail,
      defaultLocale: stores.defaultLocale,
    })
    .from(stores)
    .where(eq(stores.id, storeId));
  if (!store) return null;

  const [owner] = await tx
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(and(eq(users.storeId, storeId), eq(users.role, 'STORE_OWNER'), eq(users.isActive, true)))
    .limit(1);

  const storeLocale = normalizeLocale(store.defaultLocale);
  return {
    userId: owner?.id ?? null,
    name: owner?.name ?? store.ownerFullName,
    email: owner?.email ?? store.contactEmail,
    locale: normalizeLocale(owner?.preferredLocale, storeLocale),
    storeName: store.commercialName,
  };
}

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly database: Database = db) {}

  async findStoreByPreapprovalId(mpPreapprovalId: string): Promise<string | null> {
    const trimmed = mpPreapprovalId.trim();
    if (!trimmed) return null;
    const rows = await this.database.execute<{ store_id: string | null }>(
      sql`select subscription_store_by_preapproval(${trimmed}) as store_id`,
    );
    return rows[0]?.store_id ?? null;
  }

  async getContext(storeId: string): Promise<StoreSubscriptionContext | null> {
    return withTenant(
      storeId,
      async (tx) => {
        const [subRow] = await tx
          .select({ id: storeSubscriptions.id })
          .from(storeSubscriptions)
          .where(eq(storeSubscriptions.storeId, storeId));
        if (!subRow) return null;
        const [subscription, owner] = await Promise.all([
          selectSubscription(tx, storeId),
          loadOwnerRecipient(tx, storeId),
        ]);
        if (!subscription || !owner) return null;
        return {
          subscriptionId: subRow.id,
          subscription,
          owner,
        };
      },
      this.database,
    );
  }

  async recordCheckoutStarted(data: {
    storeId: string;
    actorId: string;
    planTier: PaidPlanTier;
    billingInterval: BillingInterval;
    amount: string;
    mpPreapprovalId: string | null;
    now: Date;
  }): Promise<void> {
    await withTenant(
      data.storeId,
      async (tx) => {
        const [sub] = await tx
          .select({
            id: storeSubscriptions.id,
            status: storeSubscriptions.status,
            mpPreapprovalId: storeSubscriptions.mpPreapprovalId,
          })
          .from(storeSubscriptions)
          .where(eq(storeSubscriptions.storeId, data.storeId))
          .for('update');
        if (!sub) return;

        // Si aún no tenía preapproval activo, guardamos el creado para correlacionar webhooks
        if (data.mpPreapprovalId && !sub.mpPreapprovalId) {
          try {
            await tx
              .update(storeSubscriptions)
              .set({ mpPreapprovalId: data.mpPreapprovalId, updatedAt: data.now })
              .where(eq(storeSubscriptions.id, sub.id));
          } catch (error) {
            if (uniqueViolation(error) !== PREAPPROVAL_CONSTRAINT) throw error;
          }
        }

        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'START_SUBSCRIPTION_CHECKOUT',
          entityName: 'store_subscriptions',
          entityId: sub.id,
          newData: {
            planTier: data.planTier,
            billingInterval: data.billingInterval,
            amount: data.amount,
            mpPreapprovalId: data.mpPreapprovalId,
          },
          createdAt: data.now,
        });
      },
      this.database,
    );
  }

  async applyPayment(data: ApplySubscriptionPaymentData): Promise<ApplySubscriptionPaymentResult> {
    try {
      return await withTenant(
        data.storeId,
        async (tx): Promise<ApplySubscriptionPaymentResult> => {
          const [subRow] = await tx
            .select()
            .from(storeSubscriptions)
            .where(eq(storeSubscriptions.storeId, data.storeId))
            .for('update');
          if (!subRow) return { status: 'STORE_NOT_FOUND' };

          const owner = await loadOwnerRecipient(tx, data.storeId);
          if (!owner) return { status: 'STORE_NOT_FOUND' };

          const [existingPayment] = await tx
            .select({ id: subscriptionPayments.id })
            .from(subscriptionPayments)
            .where(eq(subscriptionPayments.mpPaymentId, data.mpPaymentId))
            .limit(1);
          if (existingPayment) return { status: 'DUPLICATE' };

          const [insertedPayment] = await tx
            .insert(subscriptionPayments)
            .values({
              storeId: data.storeId,
              subscriptionId: subRow.id,
              mpPaymentId: data.mpPaymentId,
              planTier: data.planTier,
              billingInterval: data.billingInterval,
              amount: data.amount,
              currency: data.currency,
              status: data.status,
              paidAt: data.paidAt,
              receiptUrl: data.receiptUrl,
              rawPayload: data.rawPayload,
              createdAt: data.now,
            })
            .returning({ id: subscriptionPayments.id });
          const paymentId = insertedPayment!.id;

          const currentSub: Subscription = {
            planTier: subRow.planTier as PlanTier,
            status: subRow.status as SubscriptionStatus,
            trialEndsAt: subRow.trialEndsAt,
            gracePeriodEndsAt: subRow.gracePeriodEndsAt,
            currentPeriodEnd: subRow.currentPeriodEnd,
            cancelAtPeriodEnd: subRow.cancelAtPeriodEnd,
            billingInterval: (subRow.billingInterval as BillingInterval | null) ?? null,
            mpPreapprovalId: subRow.mpPreapprovalId,
          };

          let oldPreapprovalToCancel: string | null = null;
          let nextSub: Subscription = currentSub;

          if (data.status === 'APPROVED') {
            const currentPeriodEnd = PlanLimits.nextPeriodEnd({
              subscription: currentSub,
              targetTier: data.planTier,
              interval: data.billingInterval,
              now: data.now,
            });
            // D2: el plan anual es pago único (no autorenueva); el mensual con tarjeta sí
            const cancelAtPeriodEnd = data.billingInterval === 'YEARLY';
            const nextPreapprovalId =
              data.billingInterval === 'MONTHLY'
                ? (data.mpPreapprovalId ?? subRow.mpPreapprovalId)
                : null;

            if (subRow.mpPreapprovalId && subRow.mpPreapprovalId !== nextPreapprovalId) {
              oldPreapprovalToCancel = subRow.mpPreapprovalId;
            }

            await tx
              .update(storeSubscriptions)
              .set({
                planTier: data.planTier,
                billingInterval: data.billingInterval,
                status: 'ACTIVE',
                gracePeriodEndsAt: null,
                mpPreapprovalId: nextPreapprovalId,
                currentPeriodStart: data.now,
                currentPeriodEnd,
                cancelAtPeriodEnd,
                updatedAt: data.now,
              })
              .where(eq(storeSubscriptions.id, subRow.id));

            nextSub = {
              planTier: data.planTier,
              status: 'ACTIVE',
              trialEndsAt: subRow.trialEndsAt,
              gracePeriodEndsAt: null,
              currentPeriodEnd,
              cancelAtPeriodEnd,
              billingInterval: data.billingInterval,
              mpPreapprovalId: nextPreapprovalId,
            };
          } else if (data.status === 'REJECTED') {
            // US23 crit. 4: otorga período de gracia de 5 días hábiles en Lima
            const existingGrace =
              subRow.status === 'PAST_DUE' &&
              subRow.gracePeriodEndsAt &&
              subRow.gracePeriodEndsAt.getTime() > data.now.getTime()
                ? subRow.gracePeriodEndsAt
                : null;
            const gracePeriodEndsAt = existingGrace ?? PlanLimits.gracePeriodEnd(data.now);
            const activePaidTier: PaidPlanTier =
              subRow.planTier === 'BODEGA_PRO' || subRow.planTier === 'NEGOCIO_PLUS'
                ? subRow.planTier
                : data.planTier;
            const nextPreapprovalId = data.mpPreapprovalId ?? subRow.mpPreapprovalId;

            await tx
              .update(storeSubscriptions)
              .set({
                planTier: activePaidTier,
                billingInterval:
                  (subRow.billingInterval as BillingInterval | null) ?? data.billingInterval,
                status: 'PAST_DUE',
                gracePeriodEndsAt,
                mpPreapprovalId: nextPreapprovalId,
                updatedAt: data.now,
              })
              .where(eq(storeSubscriptions.id, subRow.id));

            nextSub = {
              ...currentSub,
              planTier: activePaidTier,
              billingInterval:
                (subRow.billingInterval as BillingInterval | null) ?? data.billingInterval,
              status: 'PAST_DUE',
              gracePeriodEndsAt,
              mpPreapprovalId: nextPreapprovalId,
            };
          } else {
            // REFUNDED: regresa a Casero activo sin borrar datos de la tienda
            if (subRow.mpPreapprovalId) {
              oldPreapprovalToCancel = subRow.mpPreapprovalId;
            }
            await tx
              .update(storeSubscriptions)
              .set({
                planTier: 'CASERO',
                billingInterval: null,
                status: 'ACTIVE',
                gracePeriodEndsAt: null,
                mpPreapprovalId: null,
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
                updatedAt: data.now,
              })
              .where(eq(storeSubscriptions.id, subRow.id));

            nextSub = {
              planTier: 'CASERO',
              status: 'ACTIVE',
              trialEndsAt: subRow.trialEndsAt,
              gracePeriodEndsAt: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
              billingInterval: null,
              mpPreapprovalId: null,
            };
          }

          await tx.insert(auditLogs).values({
            storeId: data.storeId,
            userId: owner.userId,
            action: `SUBSCRIPTION_PAYMENT_${data.status}`,
            entityName: 'store_subscriptions',
            entityId: subRow.id,
            oldData: {
              planTier: subRow.planTier,
              status: subRow.status,
              billingInterval: subRow.billingInterval,
              currentPeriodEnd: subRow.currentPeriodEnd?.toISOString() ?? null,
              gracePeriodEndsAt: subRow.gracePeriodEndsAt?.toISOString() ?? null,
            },
            newData: {
              mpPaymentId: data.mpPaymentId,
              paymentId,
              amount: data.amount,
              planTier: nextSub.planTier,
              status: nextSub.status,
              billingInterval: nextSub.billingInterval,
              currentPeriodEnd: nextSub.currentPeriodEnd?.toISOString() ?? null,
              gracePeriodEndsAt: nextSub.gracePeriodEndsAt?.toISOString() ?? null,
            },
            createdAt: data.now,
          });

          return {
            status: 'APPLIED',
            paymentId,
            subscription: nextSub,
            oldPreapprovalToCancel,
            owner,
          };
        },
        this.database,
      );
    } catch (error) {
      if (uniqueViolation(error) === PAYMENT_MP_ID_CONSTRAINT) {
        return { status: 'DUPLICATE' };
      }
      throw error;
    }
  }

  async cancelAutoRenew(data: {
    storeId: string;
    actorId: string;
    now: Date;
  }): Promise<CancelAutoRenewResult> {
    return withTenant(
      data.storeId,
      async (tx): Promise<CancelAutoRenewResult> => {
        const [subRow] = await tx
          .select()
          .from(storeSubscriptions)
          .where(eq(storeSubscriptions.storeId, data.storeId))
          .for('update');
        if (!subRow) return { status: 'NOT_FOUND' };

        if (
          subRow.planTier === 'CASERO' ||
          (subRow.status !== 'ACTIVE' && subRow.status !== 'PAST_DUE') ||
          subRow.cancelAtPeriodEnd
        ) {
          return { status: 'NOT_ACTIVE_RECURRING' };
        }

        const currentPeriodEnd =
          subRow.currentPeriodEnd ??
          PlanLimits.nextPeriodEnd({
            subscription: {
              planTier: subRow.planTier as PlanTier,
              status: subRow.status as SubscriptionStatus,
              trialEndsAt: subRow.trialEndsAt,
            },
            targetTier: subRow.planTier as PaidPlanTier,
            interval: (subRow.billingInterval as BillingInterval | null) ?? 'MONTHLY',
            now: data.now,
          });

        await tx
          .update(storeSubscriptions)
          .set({
            cancelAtPeriodEnd: true,
            currentPeriodEnd,
            mpPreapprovalId: null,
            updatedAt: data.now,
          })
          .where(eq(storeSubscriptions.id, subRow.id));

        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'CANCEL_SUBSCRIPTION_RENEWAL',
          entityName: 'store_subscriptions',
          entityId: subRow.id,
          oldData: {
            cancelAtPeriodEnd: subRow.cancelAtPeriodEnd,
            mpPreapprovalId: subRow.mpPreapprovalId,
          },
          newData: {
            cancelAtPeriodEnd: true,
            currentPeriodEnd: currentPeriodEnd.toISOString(),
          },
          createdAt: data.now,
        });

        return {
          status: 'OK',
          mpPreapprovalId: subRow.mpPreapprovalId,
          currentPeriodEnd,
        };
      },
      this.database,
    );
  }
}
