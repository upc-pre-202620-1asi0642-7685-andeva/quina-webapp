import { eq } from 'drizzle-orm';
import type { Locale } from '@/core/domain/shared/locale';
import { notificationLogs, stores } from '../schema';
import type { Tx } from '../with-tenant';

export const COLLECTIONS_TYPES = [
  'CHARGE_DIGEST',
  'CYCLE_STATEMENT',
  'PAYMENT_REMINDER',
  'LATE_PAYMENT',
  'PAYMENT_RECEIPT',
] as const;
export type CollectionsLogType = (typeof COLLECTIONS_TYPES)[number];

const LOCALES: readonly Locale[] = ['es', 'en', 'qu'];

/**
 * Deja un correo de cobranza en `notification_logs` como `QUEUED`, en la misma
 * transacción del negocio (D10). Los índices únicos parciales impiden un
 * segundo resumen por vecino y día y un segundo aviso por ciclo: si ya existe,
 * no hace nada y devuelve null; si no, el id de la fila (para enviarla enseguida).
 */
export async function queueNotification(
  tx: Tx,
  input: {
    storeId: string;
    customerId: string;
    type: CollectionsLogType;
    recipientEmail: string;
    customerLocale: string | null;
    referenceType?: 'settlement_cycles' | 'debt_payments';
    referenceId?: string;
    digestDate?: string;
    createdAt?: Date;
  },
): Promise<string | null> {
  let locale = input.customerLocale as Locale | null;
  if (!locale || !LOCALES.includes(locale)) {
    const [store] = await tx
      .select({ locale: stores.defaultLocale })
      .from(stores)
      .where(eq(stores.id, input.storeId));
    locale = LOCALES.includes(store?.locale as Locale) ? (store!.locale as Locale) : 'es';
  }
  const rows = await tx
    .insert(notificationLogs)
    .values({
      storeId: input.storeId,
      customerId: input.customerId,
      notificationType: input.type,
      recipientEmail: input.recipientEmail,
      locale,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      digestDate: input.digestDate ?? null,
      status: 'QUEUED',
      ...(input.createdAt ? { createdAt: input.createdAt, updatedAt: input.createdAt } : {}),
    })
    .onConflictDoNothing()
    .returning({ id: notificationLogs.id });
  return rows[0]?.id ?? null;
}
