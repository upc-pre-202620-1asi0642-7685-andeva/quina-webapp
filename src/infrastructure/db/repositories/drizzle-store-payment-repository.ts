import { eq } from 'drizzle-orm';
import type { StorePaymentRepository } from '@/core/domain/ports/store-payment-repository';
import { auditLogs, stores } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';

/** `stores` no tiene RLS; withTenant sí la abre para la auditoría de la tienda. */
export class DrizzleStorePaymentRepository implements StorePaymentRepository {
  save(input: Parameters<StorePaymentRepository['save']>[0]) {
    return withTenant(input.storeId, async (tx) => {
      const [before] = await tx
        .select({
          yapeNumber: stores.yapeNumber,
          plinNumber: stores.plinNumber,
          bankName: stores.bankName,
          bankAccountNumber: stores.bankAccountNumber,
          bankCci: stores.bankCci,
          paymentQrPath: stores.paymentQrPath,
        })
        .from(stores)
        .where(eq(stores.id, input.storeId))
        .for('update');
      if (!before) throw new Error(`La tienda ${input.storeId} no existe`);

      const qr = input.qrPath === undefined ? {} : { paymentQrPath: input.qrPath };
      await tx
        .update(stores)
        .set({ ...input.details, ...qr, updatedAt: new Date() })
        .where(eq(stores.id, input.storeId));
      await tx.insert(auditLogs).values({
        storeId: input.storeId,
        userId: input.actorId,
        action: 'UPDATE_PAYMENT_DETAILS',
        entityName: 'stores',
        entityId: input.storeId,
        oldData: before,
        newData: { ...input.details, ...qr },
      });
      return { previousQrPath: before.paymentQrPath };
    });
  }
}
