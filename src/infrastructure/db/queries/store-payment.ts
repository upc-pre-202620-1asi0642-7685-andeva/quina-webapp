import { eq } from 'drizzle-orm';
import type { PaymentDetails } from '@/core/domain/identity/payment-details';
import { stores } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';

export type StorePayment = PaymentDetails & { qrPath: string | null };

/** Datos de cobro de la tienda (ajustes del dueño y portal del vecino, Plan 5). */
export function getStorePayment(storeId: string): Promise<StorePayment> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({
        yapeNumber: stores.yapeNumber,
        plinNumber: stores.plinNumber,
        bankName: stores.bankName,
        bankAccountNumber: stores.bankAccountNumber,
        bankCci: stores.bankCci,
        qrPath: stores.paymentQrPath,
      })
      .from(stores)
      .where(eq(stores.id, storeId));
    if (!row) throw new Error(`La tienda ${storeId} no existe`);
    return row;
  });
}
