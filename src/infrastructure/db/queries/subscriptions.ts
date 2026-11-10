import { and, desc, eq } from 'drizzle-orm';
import type { BillingInterval, PaidPlanTier } from '@/core/domain/billing/plan-limits';
import type { SubscriptionPaymentStatus } from '@/core/domain/ports/subscription-gateway';
import type {
  SubscriptionPaymentSummary,
  SubscriptionReceiptDetail,
} from '@/core/domain/ports/subscription-repository';
import { stores, subscriptionPayments } from '../schema';
import { withTenant } from '../with-tenant';

/** Historial de pagos de suscripción de la tienda, del más reciente al más antiguo. */
export async function listSubscriptionPayments(
  storeId: string,
): Promise<SubscriptionPaymentSummary[]> {
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        id: subscriptionPayments.id,
        mpPaymentId: subscriptionPayments.mpPaymentId,
        planTier: subscriptionPayments.planTier,
        billingInterval: subscriptionPayments.billingInterval,
        amount: subscriptionPayments.amount,
        currency: subscriptionPayments.currency,
        status: subscriptionPayments.status,
        paidAt: subscriptionPayments.paidAt,
        receiptUrl: subscriptionPayments.receiptUrl,
        createdAt: subscriptionPayments.createdAt,
      })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.storeId, storeId))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      mpPaymentId: row.mpPaymentId,
      planTier: row.planTier as PaidPlanTier,
      billingInterval: row.billingInterval as BillingInterval,
      amount: row.amount,
      currency: 'PEN',
      status: row.status as SubscriptionPaymentStatus,
      paidAt: row.paidAt,
      receiptUrl: row.receiptUrl,
      createdAt: row.createdAt,
    }));
  });
}

/** Detalle de un comprobante de pago de suscripción (US23 crit. 5). */
export async function getSubscriptionPaymentReceipt(
  storeId: string,
  paymentId: string,
): Promise<SubscriptionReceiptDetail | null> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({
        payment: subscriptionPayments,
        store: {
          commercialName: stores.commercialName,
          taxIdType: stores.taxIdType,
          taxIdNumber: stores.taxIdNumber,
          ownerFullName: stores.ownerFullName,
          contactEmail: stores.contactEmail,
          address: stores.address,
        },
      })
      .from(subscriptionPayments)
      .innerJoin(stores, eq(stores.id, subscriptionPayments.storeId))
      .where(
        and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.storeId, storeId)),
      );
    if (!row) return null;

    return {
      id: row.payment.id,
      mpPaymentId: row.payment.mpPaymentId,
      planTier: row.payment.planTier as PaidPlanTier,
      billingInterval: row.payment.billingInterval as BillingInterval,
      amount: row.payment.amount,
      currency: 'PEN',
      status: row.payment.status as SubscriptionPaymentStatus,
      paidAt: row.payment.paidAt,
      receiptUrl: row.payment.receiptUrl,
      createdAt: row.payment.createdAt,
      store: row.store,
    };
  });
}
