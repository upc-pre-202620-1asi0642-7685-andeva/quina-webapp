import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/infrastructure/db/connection';
import { getStorePayment } from '@/infrastructure/db/queries/store-payment';
import { DrizzleStorePaymentRepository } from '@/infrastructure/db/repositories/drizzle-store-payment-repository';
import { auditLogs } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { storeWithOwner } from './support/seed';

afterAll(closeDb);

const details = {
  yapeNumber: '987654321',
  plinNumber: null,
  bankName: 'BCP',
  bankAccountNumber: '1911234567012',
  bankCci: '00219100123456701255',
};

describe('datos de cobro de la tienda (Plan 5, P3)', () => {
  it('guarda los datos y el QR, devuelve el QR anterior y deja auditoría', async () => {
    const ctx = await storeWithOwner();
    const repo = new DrizzleStorePaymentRepository();

    const first = await repo.save({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      details,
      qrPath: 'stores/x/qr-1.png',
    });
    expect(first.previousQrPath).toBeNull();
    // undefined deja el QR como estaba
    const second = await repo.save({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      details: { ...details, yapeNumber: null },
      qrPath: undefined,
    });
    expect(second.previousQrPath).toBe('stores/x/qr-1.png');

    expect(await getStorePayment(ctx.storeId)).toEqual({
      ...details,
      yapeNumber: null,
      qrPath: 'stores/x/qr-1.png',
    });
    const audit = await withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.storeId, ctx.storeId), eq(auditLogs.action, 'UPDATE_PAYMENT_DETAILS')),
        ),
    );
    expect(audit).toHaveLength(2);
    expect(audit.every((row) => row.userId === ctx.ownerId)).toBe(true);
  });
});
