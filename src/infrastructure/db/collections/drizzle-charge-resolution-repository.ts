import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { Quantity } from '@/core/domain/catalog/quantity';
import { cycleWithPaymentOn } from '@/core/domain/credit/billing-cycle';
import {
  confirmCharge,
  objectCharge,
  planVoid,
  type ResolvableCharge,
} from '@/core/domain/credit/charge-resolution';
import type { CycleStatus } from '@/core/domain/credit/debt-payment';
import type { ChargeResolutionRepository } from '@/core/domain/ports/charge-resolution-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money, type Currency } from '@/core/domain/shared/money';
import { err, ok } from '@/core/domain/shared/result';
import {
  auditLogs,
  creditAccounts,
  creditChargeVoids,
  creditCharges,
  creditInstallments,
  inventoryMovements,
  products,
  saleItems,
  settlementCycles,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';

type Loaded = {
  charge: typeof creditCharges.$inferSelect;
  cycle: typeof settlementCycles.$inferSelect;
  account: typeof creditAccounts.$inferSelect;
  resolvable: ResolvableCharge;
};

/**
 * Bloquea la cuenta del vecino (como la venta y el corte) y lee el cargo con su
 * ciclo; así una anulación no se cruza con un cobro ni con el corte.
 */
async function load(tx: Tx, chargeId: string): Promise<Loaded | null> {
  const [owner] = await tx
    .select({ accountId: creditCharges.creditAccountId })
    .from(creditCharges)
    .where(eq(creditCharges.id, chargeId));
  if (!owner) return null;
  const [account] = await tx
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.id, owner.accountId))
    .for('update');
  const [row] = await tx
    .select({ charge: creditCharges, cycle: settlementCycles })
    .from(creditCharges)
    .innerJoin(settlementCycles, eq(settlementCycles.id, creditCharges.settlementCycleId))
    .where(eq(creditCharges.id, chargeId));
  if (!row || !account) return null;
  const currency = account.currency as Currency;
  const { charge, cycle } = row;
  return {
    charge,
    cycle,
    account,
    resolvable: {
      modality: charge.chargeModality as ResolvableCharge['modality'],
      status: charge.status as ResolvableCharge['status'],
      consentStatus: charge.consentStatus as ResolvableCharge['consentStatus'],
      consentDeadline: charge.consentDeadline,
      principal: Money.of(charge.principalAmount, currency),
      liquidatedInterest: charge.compensatoryInterest
        ? Money.of(charge.compensatoryInterest, currency)
        : null,
      cycleStatus: cycle.status as CycleStatus,
      anyInstallmentBilled:
        charge.chargeModality === 'INSTALLMENTS'
          ? await anyInstallmentBilled(tx, charge.id, account)
          : false,
    },
  };
}

/** P3: ¿alguna cuota del cargo ya cayó en un ciclo liquidado? */
async function anyInstallmentBilled(
  tx: Tx,
  chargeId: string,
  account: typeof creditAccounts.$inferSelect,
): Promise<boolean> {
  const rows = await tx
    .select({ dueDate: creditInstallments.dueDate, status: creditInstallments.status })
    .from(creditInstallments)
    .where(eq(creditInstallments.creditChargeId, chargeId));
  if (rows.some((r) => r.status === 'PAID' || r.status === 'OVERDUE')) return true;
  const days = { cutOffDay: account.cutOffDay, paymentDueDay: account.paymentDueDay };
  for (const row of rows) {
    const cycle = cycleWithPaymentOn(BusinessDate.fromInstant(row.dueDate), days);
    if (!cycle) continue;
    const [billed] = await tx
      .select({ id: settlementCycles.id })
      .from(settlementCycles)
      .where(
        and(
          eq(settlementCycles.creditAccountId, account.id),
          ne(settlementCycles.status, 'OPEN'),
          gte(settlementCycles.paymentDueDate, BusinessDate.startInstant(cycle.paymentDueDate)),
          lte(settlementCycles.paymentDueDate, BusinessDate.endInstant(cycle.paymentDueDate)),
        ),
      )
      .limit(1);
    if (billed) return true;
  }
  return false;
}

export class DrizzleChargeResolutionRepository implements ChargeResolutionRepository {
  object(input: { storeId: string; chargeId: string; note: string; now: Date }) {
    return withTenant(input.storeId, async (tx) => {
      const loaded = await load(tx, input.chargeId);
      if (!loaded) return err('CHARGE_NOT_FOUND' as const);
      const allowed = objectCharge(loaded.resolvable, input.now);
      if (!allowed.ok) return allowed;
      await tx
        .update(creditCharges)
        .set({
          consentStatus: 'OBJECTED',
          objectedAt: input.now,
          objectionNote: input.note,
          updatedAt: input.now,
        })
        .where(eq(creditCharges.id, input.chargeId));
      return ok(undefined);
    });
  }

  confirm(input: { storeId: string; chargeId: string; userId: string; note: string; now: Date }) {
    return withTenant(input.storeId, async (tx) => {
      const loaded = await load(tx, input.chargeId);
      if (!loaded) return err('CHARGE_NOT_FOUND' as const);
      const allowed = confirmCharge(loaded.resolvable);
      if (!allowed.ok) return allowed;
      await tx
        .update(creditCharges)
        .set({
          consentStatus: 'ACCEPTED',
          resolvedAt: input.now,
          resolvedByUserId: input.userId,
          resolutionNote: input.note,
          updatedAt: input.now,
        })
        .where(eq(creditCharges.id, input.chargeId));
      await tx.insert(auditLogs).values({
        storeId: input.storeId,
        userId: input.userId,
        action: 'CHARGE_CONFIRMED',
        entityName: 'credit_charges',
        entityId: input.chargeId,
        newData: { note: input.note },
        createdAt: input.now,
      });
      return ok(undefined);
    });
  }

  void(input: { storeId: string; chargeId: string; userId: string; reason: string; now: Date }) {
    return withTenant(input.storeId, async (tx) => {
      const loaded = await load(tx, input.chargeId);
      if (!loaded) return err('CHARGE_NOT_FOUND' as const);
      const plan = planVoid(loaded.resolvable);
      if (!plan.ok) return plan;
      const { charge, cycle, account } = loaded;
      const currency = account.currency as Currency;
      const { voidedAmount, balanceDecrease, recalculateCycle } = plan.value;

      const [voided] = await tx
        .insert(creditChargeVoids)
        .values({
          storeId: input.storeId,
          creditChargeId: charge.id,
          saleId: charge.saleId,
          userId: input.userId,
          appliedCycleId: cycle.id,
          voidedAmount: voidedAmount.toFixed2(),
          reason: input.reason,
          createdAt: input.now,
        })
        .returning({ id: creditChargeVoids.id });

      await tx
        .update(creditCharges)
        .set({
          status: 'VOIDED',
          resolvedAt: input.now,
          resolvedByUserId: input.userId,
          resolutionNote: input.reason,
          updatedAt: input.now,
        })
        .where(eq(creditCharges.id, charge.id));
      if (charge.chargeModality === 'INSTALLMENTS') {
        await tx
          .update(creditInstallments)
          .set({ status: 'VOIDED', updatedAt: input.now })
          .where(eq(creditInstallments.creditChargeId, charge.id));
      }

      await returnStock(tx, input.storeId, charge.saleId, voided!.id, input.userId, input.now);

      // P2: el ciclo ya liquidado se descuenta ahí mismo; si queda en cero, queda pagado (D12)
      if (recalculateCycle) {
        const totalDue = Money.of(cycle.totalDue, currency).minus(voidedAmount);
        await tx
          .update(settlementCycles)
          .set({
            adjustmentsTotal: Money.of(cycle.adjustmentsTotal, currency)
              .plus(voidedAmount)
              .toFixed2(),
            totalDue: totalDue.toFixed2(),
            status: totalDue.isZero() ? 'PAID' : cycle.status,
            updatedAt: input.now,
          })
          .where(eq(settlementCycles.id, cycle.id));
      }

      await tx
        .update(creditAccounts)
        .set({
          currentBalance: Money.of(account.currentBalance, currency)
            .minus(balanceDecrease)
            .toFixed2(),
          updatedAt: input.now,
        })
        .where(eq(creditAccounts.id, account.id));

      await tx.insert(auditLogs).values({
        storeId: input.storeId,
        userId: input.userId,
        action: 'CHARGE_VOIDED',
        entityName: 'credit_charges',
        entityId: charge.id,
        oldData: { status: charge.status, consentStatus: charge.consentStatus },
        newData: {
          voidId: voided!.id,
          voidedAmount: voidedAmount.toFixed2(),
          reason: input.reason,
        },
        createdAt: input.now,
      });
      return ok({ voidedAmount: voidedAmount.toFixed2() });
    });
  }
}

/**
 * US11 crit. 7: los productos vuelven al stock con un `CUSTOMER_RETURN` cuya
 * referencia es la anulación. Los servicios no llevan stock.
 */
async function returnStock(
  tx: Tx,
  storeId: string,
  saleId: string,
  voidId: string,
  userId: string,
  now: Date,
) {
  const lines = await tx
    .select({
      productId: saleItems.productId,
      quantity: saleItems.quantity,
      unitCost: saleItems.unitCostSnapshot,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId));
  const ids = [...new Set(lines.map((l) => l.productId))].sort();
  if (ids.length === 0) return;
  const locked = await tx
    .select({
      id: products.id,
      isService: products.isService,
      currentStock: products.currentStock,
      averageCost: products.currentAverageCost,
    })
    .from(products)
    .where(and(eq(products.storeId, storeId), inArray(products.id, ids)))
    .orderBy(products.id)
    .for('update');
  const stock = new Map(locked.map((p) => [p.id, p]));
  for (const line of lines) {
    const product = stock.get(line.productId);
    if (!product || product.isService) continue;
    const after = Quantity.plus(product.currentStock, line.quantity);
    product.currentStock = after;
    await tx
      .update(products)
      .set({ currentStock: after, updatedAt: now })
      .where(eq(products.id, product.id));
    await tx.insert(inventoryMovements).values({
      storeId,
      productId: product.id,
      movementType: 'CUSTOMER_RETURN',
      referenceId: voidId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      totalCost: Quantity.valuedAt(line.quantity, line.unitCost),
      stockAfter: after,
      averageCostAfter: product.averageCost,
      notes: 'Anulación de cargo fiado',
      userId,
      createdAt: now,
    });
  }
}
