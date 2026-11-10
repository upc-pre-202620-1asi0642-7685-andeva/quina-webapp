import type { BillingInterval, PaidPlanTier, Subscription } from '../billing/plan-limits';
import type { Locale } from '../shared/locale';
import type { SubscriptionPaymentStatus } from './subscription-gateway';

export type StoreOwnerRecipient = {
  userId: string | null;
  name: string;
  email: string;
  locale: Locale;
  storeName: string;
};

export type StoreSubscriptionContext = {
  subscriptionId: string;
  subscription: Subscription;
  owner: StoreOwnerRecipient;
};

export type ApplySubscriptionPaymentData = {
  storeId: string;
  mpPaymentId: string;
  mpPreapprovalId: string | null;
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
  amount: string;
  currency: 'PEN';
  status: SubscriptionPaymentStatus;
  paidAt: Date | null;
  receiptUrl: string | null;
  rawPayload: Record<string, unknown>;
  now: Date;
};

export type ApplySubscriptionPaymentResult =
  | {
      status: 'APPLIED';
      paymentId: string;
      subscription: Subscription;
      oldPreapprovalToCancel: string | null;
      owner: StoreOwnerRecipient;
    }
  | { status: 'DUPLICATE' }
  | { status: 'STORE_NOT_FOUND' };

export type CancelAutoRenewResult =
  | {
      status: 'OK';
      mpPreapprovalId: string | null;
      currentPeriodEnd: Date;
    }
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_ACTIVE_RECURRING' };

export type SubscriptionPaymentSummary = {
  id: string;
  mpPaymentId: string;
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
  amount: string;
  currency: 'PEN';
  status: SubscriptionPaymentStatus;
  paidAt: Date | null;
  receiptUrl: string | null;
  createdAt: Date;
};

export type SubscriptionReceiptDetail = SubscriptionPaymentSummary & {
  store: {
    commercialName: string;
    taxIdType: string;
    taxIdNumber: string;
    ownerFullName: string;
    contactEmail: string;
    address: string | null;
  };
};

export interface SubscriptionRepository {
  /** Resuelve la tienda asociada a un `mp_preapproval_id` (para webhooks recurrentes). */
  findStoreByPreapprovalId(mpPreapprovalId: string): Promise<string | null>;

  /** Obtiene la suscripción actual y los datos de contacto del dueño de la tienda. */
  getContext(storeId: string): Promise<StoreSubscriptionContext | null>;

  /** Registra en auditoría el inicio de un checkout de suscripción. */
  recordCheckoutStarted(data: {
    storeId: string;
    actorId: string;
    planTier: PaidPlanTier;
    billingInterval: BillingInterval;
    amount: string;
    mpPreapprovalId: string | null;
    now: Date;
  }): Promise<void>;

  /** Asienta un pago (aprobado, rechazado o reembolsado) de forma atómica e idempotente. */
  applyPayment(data: ApplySubscriptionPaymentData): Promise<ApplySubscriptionPaymentResult>;

  /** Marca `cancel_at_period_end = true` conservando las funciones hasta `current_period_end`. */
  cancelAutoRenew(data: {
    storeId: string;
    actorId: string;
    now: Date;
  }): Promise<CancelAutoRenewResult>;
}
