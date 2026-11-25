import type { Locale } from '../shared/locale';

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionInput = {
  storeId: string;
  userId: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  userAgent?: string | null;
  locale: Locale;
};

export type PushSubscriptionRecord = {
  id: string;
  storeId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: Locale;
  lastSentAt?: Date | null;
};

export type PushSendStatus = 'SENT' | 'EXPIRED' | 'FAILED';

export type PushDeliverySummary = {
  sent: number;
  failed: number;
  expired: number;
};

/** Envío Web Push hacia el endpoint del navegador (VAPID en producción, outbox en desarrollo). */
export interface PushNotifier {
  send(
    subscription: PushSubscriptionRecord,
    payload: PushPayload,
  ): Promise<{ status: PushSendStatus; errorMessage?: string }>;
}

/** Almacén por tienda de suscripciones push; toda operación corre dentro de `withTenant`. */
export interface PushSubscriptionRepository {
  upsert(input: PushSubscriptionInput): Promise<void>;
  removeByEndpoint(storeId: string, userId: string, endpoint: string): Promise<number>;
  removeByIds(storeId: string, ids: readonly string[]): Promise<void>;
  listForStore(storeId: string): Promise<PushSubscriptionRecord[]>;
  listForUser(storeId: string, userId: string): Promise<PushSubscriptionRecord[]>;
  countForUser(storeId: string, userId: string): Promise<number>;
  markSent(storeId: string, ids: readonly string[], sentAt: Date): Promise<void>;
  markError(storeId: string, id: string, message: string): Promise<void>;
}
