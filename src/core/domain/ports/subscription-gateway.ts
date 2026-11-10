import type { BillingInterval, PaidPlanTier } from '../billing/plan-limits';

export type CheckoutSessionInput = {
  storeId: string;
  storeName: string;
  payerEmail: string;
  planTier: PaidPlanTier;
  billingInterval: BillingInterval;
  amount: string;
  backUrl: string;
  notificationUrl: string;
};

export type CheckoutSessionResult = {
  redirectUrl: string;
  mpPreapprovalId: string | null;
};

export type SubscriptionPaymentStatus = 'APPROVED' | 'REJECTED' | 'REFUNDED';

export type ExternalSubscriptionPayment = {
  mpPaymentId: string;
  mpPreapprovalId: string | null;
  storeId: string | null;
  planTier: PaidPlanTier | null;
  billingInterval: BillingInterval | null;
  amount: string;
  currency: 'PEN';
  status: SubscriptionPaymentStatus | 'PENDING';
  paidAt: Date | null;
  receiptUrl: string | null;
  rawPayload: Record<string, unknown>;
};

export interface SubscriptionGateway {
  /** Crea la sesión de pago en Mercado Pago (PreApproval mensual o Preference anual). */
  createCheckout(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
  /** Cancela la renovación automática de una suscripción en Mercado Pago (US23 crit. 6). */
  cancelAutoRenew(mpPreapprovalId: string): Promise<void>;
  /** Consulta un cobro en Mercado Pago por su ID para procesarlo de forma verificada. */
  getPayment(mpPaymentId: string): Promise<ExternalSubscriptionPayment | null>;
}
