import { and, asc, count, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { PlanTier, Subscription, SubscriptionStatus } from '@/core/domain/billing/plan-limits';
import type { PurchaseProductInfo } from '@/core/domain/catalog/purchase';
import { Quantity } from '@/core/domain/catalog/quantity';
import {
  buildReplenishmentDrafts,
  type ReplenishmentDraft,
} from '@/core/domain/catalog/replenishment';
import { UnitCost } from '@/core/domain/catalog/unit-cost';
import type {
  AddReceiptsGuard,
  CreateSupplierData,
  PurchaseRepository,
  RegisterPurchaseData,
  RegisterPurchaseResult,
  SupplierOption,
} from '@/core/domain/ports/purchase-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { uniqueViolation } from '../errors';
import {
  auditLogs,
  inventoryMovements,
  products,
  purchaseAttachments,
  purchaseItems,
  purchaseOrderItems,
  purchaseOrders,
  purchases,
  storeSubscriptions,
  suppliers,
  units,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';

const SUPPLIER_TAX_CONSTRAINT = 'uq_suppliers_store_tax_id';

/** Rango UTC del mes calendario actual en `America/Lima` para contar comprobantes mensuales. */
export function currentLimaMonthRange(now: Date): { start: Date; end: Date } {
  const today = BusinessDate.fromInstant(now);
  const firstDay = BusinessDate.of(today.year, today.month, 1);
  const nextMonth =
    today.month === 12
      ? BusinessDate.of(today.year + 1, 1, 1)
      : BusinessDate.of(today.year, today.month + 1, 1);
  return {
    start: BusinessDate.startInstant(firstDay),
    end: new Date(BusinessDate.startInstant(nextMonth).getTime() - 1),
  };
}

async function canAttachReceipts(
  tx: Tx,
  storeId: string,
  adding: number,
  now: Date,
  canAttach: AddReceiptsGuard,
): Promise<boolean> {
  if (adding === 0) return true;
  const [subscription] = await tx
    .select({
      planTier: storeSubscriptions.planTier,
      status: storeSubscriptions.status,
      trialEndsAt: storeSubscriptions.trialEndsAt,
    })
    .from(storeSubscriptions)
    .where(eq(storeSubscriptions.storeId, storeId))
    .for('update');
  if (!subscription) return false;
  const { start, end } = currentLimaMonthRange(now);
  const [used] = await tx
    .select({ total: count() })
    .from(purchaseAttachments)
    .where(
      and(
        eq(purchaseAttachments.storeId, storeId),
        gte(purchaseAttachments.createdAt, start),
        lte(purchaseAttachments.createdAt, end),
      ),
    );
  const current: Subscription = {
    planTier: subscription.planTier as PlanTier,
    status: subscription.status as SubscriptionStatus,
    trialEndsAt: subscription.trialEndsAt,
  };
  return canAttach(current, used?.total ?? 0, adding);
}

export class DrizzlePurchaseRepository implements PurchaseRepository {
  async suppliers(storeId: string): Promise<SupplierOption[]> {
    return withTenant(storeId, (tx) =>
      tx
        .select({
          id: suppliers.id,
          taxIdNumber: suppliers.taxIdNumber,
          tradeName: suppliers.tradeName,
          contactName: suppliers.contactName,
          phone: suppliers.phone,
          email: suppliers.email,
          isActive: suppliers.isActive,
        })
        .from(suppliers)
        .where(eq(suppliers.storeId, storeId))
        .orderBy(asc(suppliers.tradeName)),
    );
  }

  async productsForPurchase(storeId: string): Promise<PurchaseProductInfo[]> {
    return withTenant(storeId, (tx) =>
      tx
        .select({
          id: products.id,
          isService: products.isService,
          allowDecimals: units.allowDecimals,
        })
        .from(products)
        .innerJoin(units, eq(units.id, products.unitId))
        .where(eq(products.storeId, storeId)),
    );
  }

  async createSupplier(data: CreateSupplierData): Promise<{ supplierId: string } | 'TAX_ID_TAKEN'> {
    try {
      return await withTenant(data.storeId, async (tx) => {
        const [created] = await tx
          .insert(suppliers)
          .values({
            storeId: data.storeId,
            taxIdNumber: data.details.taxIdNumber,
            tradeName: data.details.tradeName,
            contactName: data.details.contactName,
            phone: data.details.phone,
            email: data.details.email,
            createdAt: data.now,
          })
          .returning({ id: suppliers.id });
        const supplierId = created!.id;
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'CREATE_SUPPLIER',
          entityName: 'suppliers',
          entityId: supplierId,
          newData: data.details,
        });
        return { supplierId };
      });
    } catch (error) {
      if (uniqueViolation(error) === SUPPLIER_TAX_CONSTRAINT) return 'TAX_ID_TAKEN';
      throw error;
    }
  }

  async registerPurchase(data: RegisterPurchaseData): Promise<RegisterPurchaseResult> {
    return withTenant(data.storeId, async (tx): Promise<RegisterPurchaseResult> => {
      if (
        !(await canAttachReceipts(
          tx,
          data.storeId,
          data.attachments.length,
          data.now,
          data.canAttach,
        ))
      ) {
        return { status: 'RECEIPT_LIMIT_REACHED' };
      }

      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(
          and(eq(suppliers.id, data.purchase.supplierId), eq(suppliers.storeId, data.storeId)),
        );
      if (!supplier) return { status: 'SUPPLIER_NOT_FOUND' };

      const productIds = data.purchase.lines.map((l) => l.productId);
      const lockedProducts = await tx
        .select({
          id: products.id,
          isService: products.isService,
          currentStock: products.currentStock,
          currentAverageCost: products.currentAverageCost,
        })
        .from(products)
        .where(and(eq(products.storeId, data.storeId), inArray(products.id, productIds)))
        .orderBy(asc(products.id))
        .for('update');

      if (lockedProducts.length !== productIds.length) {
        return { status: 'PRODUCT_NOT_FOUND' };
      }
      const byId = new Map(lockedProducts.map((p) => [p.id, p]));
      for (const product of lockedProducts) {
        if (product.isService) return { status: 'PRODUCT_IS_SERVICE' };
      }

      let validOrderId: string | null = null;
      if (data.purchaseOrderId) {
        const [order] = await tx
          .select({ id: purchaseOrders.id })
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.id, data.purchaseOrderId),
              eq(purchaseOrders.storeId, data.storeId),
            ),
          )
          .for('update');
        validOrderId = order?.id ?? null;
      }

      const [created] = await tx
        .insert(purchases)
        .values({
          storeId: data.storeId,
          supplierId: data.purchase.supplierId,
          userId: data.actorId,
          purchaseOrderId: validOrderId,
          documentType: data.purchase.documentType,
          series: data.purchase.series,
          documentNumber: data.purchase.documentNumber,
          issueDate: data.purchase.issueDate,
          totalAmount: data.purchase.totalAmount,
          notes: data.purchase.notes,
          createdAt: data.now,
        })
        .returning({ id: purchases.id });
      const purchaseId = created!.id;

      await tx.insert(purchaseItems).values(
        data.purchase.lines.map((line) => ({
          storeId: data.storeId,
          purchaseId,
          productId: line.productId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          subtotal: line.subtotal,
        })),
      );

      for (const line of data.purchase.lines) {
        const current = byId.get(line.productId)!;
        const stockAfter = Quantity.plus(current.currentStock, line.quantity);
        const averageCostAfter = UnitCost.weightedAverage(
          current.currentStock,
          current.currentAverageCost,
          line.quantity,
          line.unitCost,
        );

        await tx
          .update(products)
          .set({
            currentStock: stockAfter,
            currentAverageCost: averageCostAfter,
            updatedAt: data.now,
          })
          .where(eq(products.id, line.productId));

        await tx.insert(inventoryMovements).values({
          storeId: data.storeId,
          productId: line.productId,
          movementType: 'PURCHASE_ENTRY',
          referenceId: purchaseId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          totalCost: line.subtotal,
          stockAfter,
          averageCostAfter,
          userId: data.actorId,
          createdAt: data.now,
        });
      }

      if (data.attachments.length > 0) {
        await tx.insert(purchaseAttachments).values(
          data.attachments.map((att) => ({
            storeId: data.storeId,
            purchaseId,
            filePath: att.filePath,
            fileName: att.fileName,
            fileSize: att.fileSize,
            mimeType: att.mimeType,
            createdAt: data.now,
          })),
        );
      }

      if (validOrderId) {
        await tx
          .update(purchaseOrders)
          .set({ status: 'RECEIVED', updatedAt: data.now })
          .where(eq(purchaseOrders.id, validOrderId));
      }

      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.actorId,
        action: 'REGISTER_PURCHASE',
        entityName: 'purchases',
        entityId: purchaseId,
        newData: {
          supplierId: data.purchase.supplierId,
          documentType: data.purchase.documentType,
          series: data.purchase.series,
          documentNumber: data.purchase.documentNumber,
          issueDate: data.purchase.issueDate,
          totalAmount: data.purchase.totalAmount,
          linesCount: data.purchase.lines.length,
          attachmentsCount: data.attachments.length,
        },
      });

      return { status: 'OK', purchaseId };
    });
  }

  async generateReplenishmentOrders(data: {
    storeId: string;
    actorId: string;
    now: Date;
  }): Promise<{ createdCount: number; drafts: ReplenishmentDraft[] }> {
    return withTenant(data.storeId, async (tx) => {
      const rows = await tx
        .select({
          id: products.id,
          isService: products.isService,
          isActive: products.isActive,
          currentStock: products.currentStock,
          minimumStock: products.minimumStock,
          defaultSupplierId: products.defaultSupplierId,
        })
        .from(products)
        .where(and(eq(products.storeId, data.storeId), eq(products.isActive, true)));

      const drafts = buildReplenishmentDrafts(rows);
      if (drafts.length === 0) return { createdCount: 0, drafts: [] };

      for (const draft of drafts) {
        const [existing] = await tx
          .select({ id: purchaseOrders.id })
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.storeId, data.storeId),
              eq(purchaseOrders.status, 'DRAFT'),
              draft.supplierId
                ? eq(purchaseOrders.supplierId, draft.supplierId)
                : isNull(purchaseOrders.supplierId),
            ),
          )
          .for('update');

        let orderId: string;
        if (existing) {
          orderId = existing.id;
          await tx
            .delete(purchaseOrderItems)
            .where(eq(purchaseOrderItems.purchaseOrderId, orderId));
          await tx
            .update(purchaseOrders)
            .set({ updatedAt: data.now })
            .where(eq(purchaseOrders.id, orderId));
        } else {
          const [created] = await tx
            .insert(purchaseOrders)
            .values({
              storeId: data.storeId,
              supplierId: draft.supplierId,
              userId: data.actorId,
              status: 'DRAFT',
              createdAt: data.now,
              updatedAt: data.now,
            })
            .returning({ id: purchaseOrders.id });
          orderId = created!.id;
        }

        await tx.insert(purchaseOrderItems).values(
          draft.items.map((item) => ({
            storeId: data.storeId,
            purchaseOrderId: orderId,
            productId: item.productId,
            quantity: item.quantity,
          })),
        );

        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'GENERATE_REPLENISHMENT_ORDERS',
          entityName: 'purchase_orders',
          entityId: orderId,
          newData: {
            supplierId: draft.supplierId,
            itemsCount: draft.items.length,
          },
        });
      }

      return { createdCount: drafts.length, drafts };
    });
  }

  async discardPurchaseOrder(data: {
    storeId: string;
    actorId: string;
    orderId: string;
    now: Date;
  }): Promise<'OK' | 'NOT_FOUND'> {
    return withTenant(data.storeId, async (tx) => {
      const [order] = await tx
        .select({ id: purchaseOrders.id, status: purchaseOrders.status })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, data.orderId), eq(purchaseOrders.storeId, data.storeId)))
        .for('update');
      if (!order || order.status !== 'DRAFT') return 'NOT_FOUND' as const;
      await tx
        .update(purchaseOrders)
        .set({ status: 'CANCELED', updatedAt: data.now })
        .where(eq(purchaseOrders.id, order.id));
      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.actorId,
        action: 'DISCARD_PURCHASE_ORDER',
        entityName: 'purchase_orders',
        entityId: order.id,
        oldData: { status: order.status },
        newData: { status: 'CANCELED' },
      });
      return 'OK' as const;
    });
  }
}
