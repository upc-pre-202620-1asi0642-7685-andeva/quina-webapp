import type { Currency } from '../shared/money';
import type { Locale } from '../shared/locale';

/** Correos de cobranza (US10–US13); cada uno es una fila de `notification_logs`. */
export type CollectionsMailKind =
  'charge-digest' | 'cycle-statement' | 'payment-reminder' | 'late-payment' | 'payment-receipt';

/** Línea del detalle. Fechas en `YYYY-MM-DD` de Lima y montos con 2 decimales. */
export type CollectionsMailLine =
  | {
      kind: 'purchase';
      date: string;
      /** Hora de Lima `HH:mm` (resumen diario, US11 crit. 2). */
      time?: string;
      items: { name: string; quantity: string; amount: string }[];
      days?: number;
      interest?: string;
      amount: string;
    }
  | { kind: 'installment'; number: number; total: number; amount: string }
  | { kind: 'void'; amount: string }
  | { kind: 'moratory'; days: number; amount: string };

export type CollectionsMail = {
  kind: CollectionsMailKind;
  to: string;
  locale: Locale;
  storeId: string;
  storeName: string;
  /** Teléfono o WhatsApp de la tienda, para observar un cargo (decisión P4). */
  storeContact: string | null;
  /** Yape de la tienda, para pagar. */
  storeYape: string | null;
  customerName: string;
  currency: Currency;
  lines: CollectionsMailLine[];
  /** Total del correo: lo que se compró, lo que se debe o lo que se pagó. */
  total: string;
  /** Saldo de fiado del vecino (resumen diario). */
  balance?: string;
  cutOffDate?: string;
  paymentDueDate?: string;
  receiptNumber?: string;
  paymentMethod?: 'CASH' | 'YAPE' | 'PLIN' | 'TRANSFER';
  paidAt?: string;
  /** Enlace mágico al portal del vecino (US14.2); no va en el comprobante. */
  portalUrl?: string;
};

export interface CollectionsMailer {
  /** Devuelve el id del proveedor para el webhook de rebotes (D14). */
  send(mail: CollectionsMail): Promise<{ providerMessageId: string | null }>;
}
