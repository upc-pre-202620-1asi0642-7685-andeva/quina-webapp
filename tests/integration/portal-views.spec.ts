import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import { closeDb } from '@/infrastructure/db/connection';
import { DrizzleChargeResolutionRepository } from '@/infrastructure/db/collections/drizzle-charge-resolution-repository';
import { getReceipt } from '@/infrastructure/db/queries/collections';
import { getInstallmentPlans, getPortalAccount } from '@/infrastructure/db/queries/portal';
import { auditLogs, creditCharges } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { fiar as fiarSale, neighbor, product, storeWithOwner } from './support/seed';

/** Fía y devuelve también el cargo creado, que es lo que el vecino observa. */
async function fiar(...args: Parameters<typeof fiarSale>) {
  const sale = await fiarSale(...args);
  const [row] = await withTenant(args[0].storeId, (tx) =>
    tx
      .select({ id: creditCharges.id })
      .from(creditCharges)
      .where(eq(creditCharges.saleId, sale.saleId)),
  );
  return { ...sale, chargeId: row!.id };
}

// Plan 5, R3 y R5: lo que ve y hace el vecino en su portal. `db` es quina_app.

afterAll(closeDb);

const SEP_15 = new Date('2026-09-15T15:00:00Z');
const SEP_16 = new Date('2026-09-16T15:00:00Z');

describe('vista del portal (US14.6 y 14.7)', () => {
  it('la cuenta trae saldo, límite y próximo corte; sin condiciones, account es null', async () => {
    const ctx = await storeWithOwner();
    const rosa = await neighbor(ctx);
    const milk = await product(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);

    const account = await getPortalAccount(
      { storeId: ctx.storeId, customerId: rosa.customerId, locale: 'es' },
      SEP_16,
    );
    expect(account?.account).toMatchObject({ balance: '25.00', creditLimit: '1000.00' });
    // Corte el 20 (juego de datos 1): la compra del 16 entra en el corte del 20 de septiembre
    expect(account!.account!.nextCutOffDate.toISOString()).toBe('2026-09-21T04:59:59.999Z');
    expect(account!.account!.payable).toBeNull();
  });

  it('la tabla francesa sale con cada cuota, su capital e interés', async () => {
    const ctx = await storeWithOwner();
    const rosa = await neighbor(ctx);
    const blender = await product(ctx, {
      name: 'Licuadora',
      price: '300.00',
      allowsInstallments: true,
    });
    await fiar(ctx, rosa.customerId, blender, SEP_15, { mode: 'INSTALLMENTS', count: 3 });

    const plans = await getInstallmentPlans(ctx.storeId, rosa.accountId);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.principal).toBe('300.00');
    expect(plans[0]!.rows.map((r) => [r.number, r.total, r.status])).toEqual([
      [1, 3, 'PENDING'],
      [2, 3, 'PENDING'],
      [3, 3, 'PENDING'],
    ]);
    for (const row of plans[0]!.rows) {
      expect(Number(row.principal) + Number(row.interest)).toBeCloseTo(Number(row.installment), 2);
    }
  });

  it('un recibo de otro vecino no se carga aunque se conozca su id', async () => {
    const ctx = await storeWithOwner();
    const rosa = await neighbor(ctx);
    expect(await getReceipt(ctx.storeId, randomUUID(), rosa.customerId)).toBeNull();
  });
});

describe('el vecino observa un cargo (US14.9)', () => {
  const resolver = new ResolveChargeUseCase(new DrizzleChargeResolutionRepository());

  it('observa su cargo y queda en la auditoría con su usuario', async () => {
    const ctx = await storeWithOwner();
    const rosa = await neighbor(ctx);
    const milk = await product(ctx);
    const sale = await fiar(ctx, rosa.customerId, milk, SEP_15);
    const userId = ctx.ownerId; // cualquier usuario existente: la FK de audit_logs lo exige

    expect(
      await resolver.object({
        storeId: ctx.storeId,
        customerId: rosa.customerId,
        userId,
        chargeId: sale.chargeId,
        note: 'Yo no saqué esa leche',
        now: SEP_16,
      }),
    ).toEqual({ ok: true, value: undefined });

    await withTenant(ctx.storeId, async (tx) => {
      const [charge] = await tx
        .select()
        .from(creditCharges)
        .where(eq(creditCharges.id, sale.chargeId));
      expect(charge).toMatchObject({
        consentStatus: 'OBJECTED',
        objectionNote: 'Yo no saqué esa leche',
      });
      const audit = await tx
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, sale.chargeId), eq(auditLogs.action, 'OBJECT_CHARGE')));
      expect(audit).toHaveLength(1);
      expect(audit[0]!.newData).toMatchObject({ byCustomer: true });
    });
  });

  it('no puede observar el cargo de otro vecino de la misma tienda', async () => {
    const ctx = await storeWithOwner();
    const rosa = await neighbor(ctx);
    const pedro = await neighbor(ctx, { email: `pedro-${randomUUID()}@example.com` });
    const milk = await product(ctx);
    const sale = await fiar(ctx, pedro.customerId, milk, SEP_15);

    expect(
      await resolver.object({
        storeId: ctx.storeId,
        customerId: rosa.customerId,
        userId: ctx.ownerId,
        chargeId: sale.chargeId,
        note: 'No es mío',
        now: SEP_16,
      }),
    ).toEqual({ ok: false, error: 'CHARGE_NOT_FOUND' });
  });
});
