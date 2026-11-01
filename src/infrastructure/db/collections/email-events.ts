import { and, eq, inArray } from 'drizzle-orm';
import { customers, notificationLogs } from '../schema';
import { withTenant } from '../with-tenant';

/**
 * D14: el webhook de Resend entra con la tienda de la etiqueta y RLS intacto.
 * Un rebote marca el aviso y la ficha del vecino (US11 crit. 5); una entrega
 * nunca pisa un rebote.
 */
export function recordEmailEvent(event: {
  storeId: string;
  providerMessageId: string;
  status: 'DELIVERED' | 'BOUNCED';
  at: Date;
}): Promise<boolean> {
  return withTenant(event.storeId, async (tx) => {
    const from = event.status === 'BOUNCED' ? ['SENT', 'DELIVERED'] : ['SENT'];
    const [log] = await tx
      .update(notificationLogs)
      .set({ status: event.status, updatedAt: event.at })
      .where(
        and(
          eq(notificationLogs.providerMessageId, event.providerMessageId),
          inArray(notificationLogs.status, from),
        ),
      )
      .returning({ customerId: notificationLogs.customerId });
    if (!log) return false;
    if (event.status === 'BOUNCED' && log.customerId) {
      await tx
        .update(customers)
        .set({ emailBouncedAt: event.at, updatedAt: event.at })
        .where(eq(customers.id, log.customerId));
    }
    return true;
  });
}
