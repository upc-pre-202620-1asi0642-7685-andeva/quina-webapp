import { and, asc, count, eq } from 'drizzle-orm';
import type { PlanTier, Subscription, SubscriptionStatus } from '@/core/domain/billing/plan-limits';
import type { ProductDetails } from '@/core/domain/catalog/product-details';
import { Quantity } from '@/core/domain/catalog/quantity';
import type {
  AddProductGuard,
  AdjustStockData,
  CreateProductData,
  ProductRepository,
  RecordWasteData,
  SetProductActiveData,
  Unit,
  UpdateProductData,
  UpdateProductResult,
} from '@/core/domain/ports/product-repository';
import { uniqueViolation } from '../errors';
import {
  auditLogs,
  inventoryMovements,
  productPriceHistory,
  products,
  storeSubscriptions,
  suppliers,
  units,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';

const BARCODE_CONSTRAINT = 'uq_products_store_barcode';

function detailColumns(details: ProductDetails) {
  return {
    name: details.name,
    description: details.description,
    brand: details.brand,
    sku: details.sku,
    barcode: details.barcode,
    unitId: details.unitId,
    defaultSupplierId: details.defaultSupplierId ?? null,
    isService: details.isService,
    allowsInstallments: details.allowsInstallments,
  };
}

/**
 * Bloquea la suscripción (FOR UPDATE) y cuenta los productos activos: dos altas
 * a la vez no pueden pasar ambas el límite del plan (US26 crit. 8).
 */
async function hasRoomForProduct(tx: Tx, storeId: string, canAdd: AddProductGuard) {
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
  const [active] = await tx
    .select({ total: count() })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.isActive, true)));
  const current: Subscription = {
    planTier: subscription.planTier as PlanTier,
    status: subscription.status as SubscriptionStatus,
    trialEndsAt: subscription.trialEndsAt,
  };
  return canAdd(current, active?.total ?? 0);
}

async function unitExists(tx: Tx, storeId: string, unitId: string) {
  const [unit] = await tx
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.storeId, storeId)));
  return Boolean(unit);
}

async function supplierExists(tx: Tx, storeId: string, supplierId: string | null | undefined) {
  if (!supplierId) return true;
  const [supplier] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.storeId, storeId)));
  return Boolean(supplier);
}

export class DrizzleProductRepository implements ProductRepository {
  async units(storeId: string): Promise<Unit[]> {
    return withTenant(storeId, (tx) =>
      tx
        .select({
          id: units.id,
          code: units.code,
          name: units.name,
          allowDecimals: units.allowDecimals,
        })
        .from(units)
        .where(eq(units.storeId, storeId))
        .orderBy(asc(units.code)),
    );
  }

  async create(
    data: CreateProductData,
  ): Promise<
    | { productId: string }
    | 'PLAN_LIMIT_REACHED'
    | 'BARCODE_TAKEN'
    | 'UNIT_NOT_FOUND'
    | 'SUPPLIER_NOT_FOUND'
  > {
    try {
      return await withTenant(data.storeId, async (tx) => {
        if (!(await unitExists(tx, data.storeId, data.details.unitId))) {
          return 'UNIT_NOT_FOUND' as const;
        }
        if (!(await supplierExists(tx, data.storeId, data.details.defaultSupplierId))) {
          return 'SUPPLIER_NOT_FOUND' as const;
        }
        if (!(await hasRoomForProduct(tx, data.storeId, data.canAdd))) {
          return 'PLAN_LIMIT_REACHED' as const;
        }
        const [created] = await tx
          .insert(products)
          .values({
            storeId: data.storeId,
            ...detailColumns(data.details),
            cashPrice: data.prices.cash,
            creditPrice: data.prices.credit,
            currentStock: data.initialStock,
            minimumStock: data.minimumStock,
            imageUrl: data.image?.url ?? null,
            createdAt: data.now,
            updatedAt: data.now,
          })
          .returning({ id: products.id, averageCost: products.currentAverageCost });
        const productId = created!.id;
        // D1: el stock inicial entra al kardex como conteo, al costo vigente (0 hasta US16)
        if (!Quantity.isZero(data.initialStock)) {
          await tx.insert(inventoryMovements).values({
            storeId: data.storeId,
            productId,
            movementType: 'COUNT_ADJUSTMENT',
            quantity: data.initialStock,
            unitCost: created!.averageCost,
            totalCost: Quantity.valuedAt(data.initialStock, created!.averageCost),
            stockAfter: data.initialStock,
            averageCostAfter: created!.averageCost,
            notes: 'Stock inicial',
            userId: data.actorId,
            createdAt: data.now,
          });
        }
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'CREATE_PRODUCT',
          entityName: 'products',
          entityId: productId,
          newData: {
            ...detailColumns(data.details),
            cashPrice: data.prices.cash,
            creditPrice: data.prices.credit,
            initialStock: data.initialStock,
          },
        });
        return { productId };
      });
    } catch (error) {
      if (uniqueViolation(error) === BARCODE_CONSTRAINT) return 'BARCODE_TAKEN';
      throw error;
    }
  }

  async update(data: UpdateProductData): Promise<UpdateProductResult> {
    try {
      return await withTenant(data.storeId, async (tx): Promise<UpdateProductResult> => {
        const [before] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, data.productId), eq(products.storeId, data.storeId)))
          .for('update');
        if (!before) return { status: 'NOT_FOUND' };
        if (!(await unitExists(tx, data.storeId, data.details.unitId))) {
          return { status: 'UNIT_NOT_FOUND' };
        }
        if (!(await supplierExists(tx, data.storeId, data.details.defaultSupplierId))) {
          return { status: 'SUPPLIER_NOT_FOUND' };
        }
        if (data.details.isService && !Quantity.isZero(before.currentStock)) {
          return { status: 'SERVICE_HAS_STOCK' };
        }
        const next = detailColumns(data.details);
        await tx
          .update(products)
          .set({
            ...next,
            cashPrice: data.prices.cash,
            creditPrice: data.prices.credit,
            minimumStock: data.minimumStock,
            ...(data.image !== undefined ? { imageUrl: data.image?.url ?? null } : {}),
            updatedAt: data.now,
          })
          .where(eq(products.id, data.productId));

        // US03 crit. 4: el historial se escribe en la misma transacción que el cambio
        const pricesChanged =
          before.cashPrice !== data.prices.cash || before.creditPrice !== data.prices.credit;
        if (pricesChanged) {
          await tx.insert(productPriceHistory).values({
            storeId: data.storeId,
            productId: data.productId,
            userId: data.actorId,
            oldCashPrice: before.cashPrice,
            newCashPrice: data.prices.cash,
            oldCreditPrice: before.creditPrice,
            newCreditPrice: data.prices.credit,
            reason: data.priceReason,
            createdAt: data.now,
          });
        }
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: pricesChanged ? 'UPDATE_PRICE' : 'UPDATE_PRODUCT',
          entityName: 'products',
          entityId: data.productId,
          oldData: {
            ...detailColumns({
              name: before.name,
              description: before.description,
              brand: before.brand,
              sku: before.sku,
              barcode: before.barcode,
              unitId: before.unitId,
              defaultSupplierId: before.defaultSupplierId,
              isService: before.isService,
              allowsInstallments: before.allowsInstallments,
            }),
            cashPrice: before.cashPrice,
            creditPrice: before.creditPrice,
          },
          newData: { ...next, cashPrice: data.prices.cash, creditPrice: data.prices.credit },
        });
        return { status: 'OK', previousImageUrl: before.imageUrl };
      });
    } catch (error) {
      if (uniqueViolation(error) === BARCODE_CONSTRAINT) return { status: 'BARCODE_TAKEN' };
      throw error;
    }
  }

  async setActive(data: SetProductActiveData): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'> {
    return withTenant(data.storeId, async (tx) => {
      const [product] = await tx
        .select({ isActive: products.isActive })
        .from(products)
        .where(and(eq(products.id, data.productId), eq(products.storeId, data.storeId)))
        .for('update');
      if (!product) return 'NOT_FOUND' as const;
      if (product.isActive === data.active) return 'OK' as const;
      if (data.active && !(await hasRoomForProduct(tx, data.storeId, data.canAdd))) {
        return 'PLAN_LIMIT_REACHED' as const;
      }
      await tx
        .update(products)
        .set({ isActive: data.active, updatedAt: data.now })
        .where(eq(products.id, data.productId));
      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.actorId,
        action: data.active ? 'REACTIVATE_PRODUCT' : 'DEACTIVATE_PRODUCT',
        entityName: 'products',
        entityId: data.productId,
        oldData: { isActive: product.isActive },
        newData: { isActive: data.active },
      });
      return 'OK' as const;
    });
  }

  async adjustStock(
    data: AdjustStockData,
  ): Promise<'OK' | 'NOT_FOUND' | 'IS_SERVICE' | 'NO_CHANGE'> {
    return withTenant(data.storeId, async (tx) => {
      const [product] = await tx
        .select({
          isService: products.isService,
          stock: products.currentStock,
          averageCost: products.currentAverageCost,
        })
        .from(products)
        .where(and(eq(products.id, data.productId), eq(products.storeId, data.storeId)))
        .for('update');
      if (!product) return 'NOT_FOUND' as const;
      if (product.isService) return 'IS_SERVICE' as const;
      const difference = Quantity.minus(data.countedStock, product.stock);
      if (Quantity.isZero(difference)) return 'NO_CHANGE' as const;

      await tx
        .update(products)
        .set({ currentStock: data.countedStock, updatedAt: data.now })
        .where(eq(products.id, data.productId));
      await tx.insert(inventoryMovements).values({
        storeId: data.storeId,
        productId: data.productId,
        movementType: 'COUNT_ADJUSTMENT',
        quantity: difference,
        unitCost: product.averageCost,
        totalCost: Quantity.valuedAt(difference, product.averageCost),
        stockAfter: data.countedStock,
        averageCostAfter: product.averageCost,
        notes: data.reason,
        userId: data.actorId,
        createdAt: data.now,
      });
      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.actorId,
        action: 'ADJUST_STOCK',
        entityName: 'products',
        entityId: data.productId,
        oldData: { currentStock: product.stock },
        newData: { currentStock: data.countedStock, reason: data.reason },
      });
      return 'OK' as const;
    });
  }

  async recordWaste(
    data: RecordWasteData,
  ): Promise<'OK' | 'NOT_FOUND' | 'IS_SERVICE' | 'INSUFFICIENT_STOCK'> {
    return withTenant(data.storeId, async (tx) => {
      const [product] = await tx
        .select({
          isService: products.isService,
          stock: products.currentStock,
          averageCost: products.currentAverageCost,
        })
        .from(products)
        .where(and(eq(products.id, data.productId), eq(products.storeId, data.storeId)))
        .for('update');
      if (!product) return 'NOT_FOUND' as const;
      if (product.isService) return 'IS_SERVICE' as const;
      if (Quantity.compare(data.quantity, product.stock) > 0) {
        return 'INSUFFICIENT_STOCK' as const;
      }

      const stockAfter = Quantity.minus(product.stock, data.quantity);
      const negativeQuantity = Quantity.minus('0', data.quantity);

      await tx
        .update(products)
        .set({ currentStock: stockAfter, updatedAt: data.now })
        .where(eq(products.id, data.productId));
      await tx.insert(inventoryMovements).values({
        storeId: data.storeId,
        productId: data.productId,
        movementType: 'WASTE_LOSS',
        quantity: negativeQuantity,
        unitCost: product.averageCost,
        totalCost: Quantity.valuedAt(negativeQuantity, product.averageCost),
        stockAfter,
        // US16: la merma descuenta existencias sin alterar el costo promedio unitario
        averageCostAfter: product.averageCost,
        notes: data.reason,
        userId: data.actorId,
        createdAt: data.now,
      });
      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.actorId,
        action: 'RECORD_WASTE',
        entityName: 'products',
        entityId: data.productId,
        oldData: { currentStock: product.stock },
        newData: {
          currentStock: stockAfter,
          wasteQuantity: data.quantity,
          reason: data.reason,
        },
      });
      return 'OK' as const;
    });
  }
}
