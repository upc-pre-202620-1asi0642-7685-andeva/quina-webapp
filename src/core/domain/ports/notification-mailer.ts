import type { Locale } from '../shared/locale';

export type NotificationMailKind = 'customer-welcome' | 'account-setup';

/** Quién recibe el enlace para definir su contraseña (US01, US05). */
export type AccountSetupAudience = 'employee' | 'owner' | 'admin';

/** Datos para `notification_logs`: el envío queda registrado aunque falle. */
export type MailContext = {
  storeId: string | null;
  customerId?: string;
  userId?: string;
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
}
