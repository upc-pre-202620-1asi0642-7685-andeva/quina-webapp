import type { Locale } from '../shared/locale';

export type NotificationMailKind =
  | 'customer-welcome'
  | 'account-setup'
  | 'subscription-trial-ending'
  | 'subscription-payment-failed'
  | 'subscription-payment-approved';

/** Quién recibe el enlace para definir su contraseña (US01, US05). */
export type AccountSetupAudience = 'employee' | 'owner' | 'admin';

/** Datos para `notification_logs`: el envío queda registrado aunque falle. */
export type MailContext = {
  storeId: string | null;
  customerId?: string;
  userId?: string;
  referenceType?: string;
  referenceId?: string;
};

export type SubscriptionNoticeInput =
  | {
      kind: 'trial_ending';
      to: string;
      locale: Locale;
      name: string;
      storeName: string;
      daysLeft: number;
      endsDate: string;
      url: string;
    }
  | {
      kind: 'payment_failed';
      to: string;
      locale: Locale;
      name: string;
      storeName: string;
      graceEndsDate: string;
      url: string;
    }
  | {
      kind: 'payment_approved';
      to: string;
      locale: Locale;
      name: string;
      storeName: string;
      planName: string;
      amount: string;
      periodEndDate: string;
      receiptUrl: string;
    };

export interface NotificationMailer {
  /** US04 crit. 6: bienvenida al vecino con el enlace a la política de la tienda. */
  sendCustomerWelcome(
    input: {
      to: string;
      locale: Locale;
      customerName: string;
      storeName: string;
      privacyUrl: string;
    },
    context: MailContext,
  ): Promise<void>;

  /** Enlace de un solo uso para definir la contraseña; vence en 72 horas. */
  sendAccountSetup(
    input: {
      to: string;
      locale: Locale;
      audience: AccountSetupAudience;
      name: string;
      storeName: string | null;
      url: string;
    },
    context: MailContext,
  ): Promise<void>;

  /** US23 crit. 4 y US25 crit. 3: avisos de prueba por vencer, fallo de cobro y recibo de suscripción. */
  sendSubscriptionNotice?(input: SubscriptionNoticeInput, context: MailContext): Promise<void>;
}
