import { eq } from 'drizzle-orm';
import type { RusCategory, TaxRegime } from '@/core/domain/tax/rus';
import { auditLogs, stores } from '../schema';
import { withTenant } from '../with-tenant';

/** US21 crit. 1: régimen y categoría de la tienda, con su auditoría (`stores` no tiene RLS). */
export async function saveTaxSettings(input: {
  storeId: string;
  actorId: string;
  taxRegime: TaxRegime;
  rusCategory: RusCategory;
}): Promise<void> {
  await withTenant(input.storeId, async (tx) => {
    const [before] = await tx
      .select({ taxRegime: stores.taxRegime, rusCategory: stores.rusCategory })
      .from(stores)
      .where(eq(stores.id, input.storeId))
      .for('update');
    if (!before) throw new Error(`La tienda ${input.storeId} no existe`);
    if (before.taxRegime === input.taxRegime && before.rusCategory === input.rusCategory) return;

    const next = { taxRegime: input.taxRegime, rusCategory: input.rusCategory };
    await tx
      .update(stores)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(stores.id, input.storeId));
    await tx.insert(auditLogs).values({
      storeId: input.storeId,
      userId: input.actorId,
      action: 'UPDATE_TAX_SETTINGS',
      entityName: 'stores',
      entityId: input.storeId,
      oldData: before,
      newData: next,
    });
  });
}
