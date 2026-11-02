import { and, asc, count, desc, eq, gt, ilike, lte, or } from 'drizzle-orm';
import {
  inventoryMovements,
  productPriceHistory,
  products,
  suppliers,
  units,
  users,
} from '../schema';
import { withTenant } from '../with-tenant';

export type ProductListItem = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  isService: boolean;
  isActive: boolean;
  cashPrice: string;
  creditPrice: string;
  currentStock: string;
  minimumStock: string;
  currentAverageCost: string;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  imageUrl: string | null;
  unitCode: string;
  allowDecimals: boolean;
  allowsInstallments: boolean;
};

export type PriceChange = {
  id: string;
  oldCashPrice: string;
  newCashPrice: string;
  oldCreditPrice: string;
  newCreditPrice: string;
  reason: string | null;
  userName: string;
  createdAt: Date;
};

export type KardexMovementType =
  'PURCHASE_ENTRY' | 'SALE_EXIT' | 'WASTE_LOSS' | 'COUNT_ADJUSTMENT' | 'CUSTOMER_RETURN';

export type KardexMovement = {
  id: string;
  movementType: KardexMovementType;
  referenceId: string | null;
  quantity: string;
  unitCost: string;
  totalCost: string;
  stockAfter: string;
  averageCostAfter: string;
  notes: string | null;
  userName: string;
  createdAt: Date;
};

export type ProductDetail = ProductListItem & {
  description: string | null;
  sku: string | null;
  unitId: string;
  unitName: string;
  priceHistory: PriceChange[];
  movements: KardexMovement[];
};

const LIST_LIMIT = 300;

const listColumns = {
  id: products.id,
  name: products.name,
  brand: products.brand,
  barcode: products.barcode,
  isService: products.isService,
  isActive: products.isActive,
  cashPrice: products.cashPrice,
  creditPrice: products.creditPrice,
  currentStock: products.currentStock,
  minimumStock: products.minimumStock,
  currentAverageCost: products.currentAverageCost,
  defaultSupplierId: products.defaultSupplierId,
  defaultSupplierName: suppliers.tradeName,
  imageUrl: products.imageUrl,
  unitCode: units.code,
  allowDecimals: units.allowDecimals,
  allowsInstallments: products.allowsInstallments,
};

/** Catálogo de la tienda con búsqueda por nombre, marca o código de barras y filtro de stock bajo. */
export async function listProducts(
  storeId: string,
  search = '',
  options: { activeOnly?: boolean; lowStockOnly?: boolean } = {},
): Promise<ProductListItem[]> {
  const term = search.trim().replace(/[%_\\]/g, '');
  return withTenant(storeId, (tx) =>
    tx
      .select(listColumns)
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(suppliers, eq(suppliers.id, products.defaultSupplierId))
      .where(
        and(
          eq(products.storeId, storeId),
          options.activeOnly || options.lowStockOnly ? eq(products.isActive, true) : undefined,
          options.lowStockOnly
            ? and(
                eq(products.isService, false),
                gt(products.minimumStock, '0'),
                lte(products.currentStock, products.minimumStock),
              )
            : undefined,
          term
            ? or(
                ilike(products.name, `%${term}%`),
                ilike(products.brand, `%${term}%`),
                eq(products.barcode, term),
              )
            : undefined,
        ),
      )
      .orderBy(desc(products.isActive), asc(products.name))
      .limit(LIST_LIMIT),
  );
}

/** US17 crit. 3: cantidad de productos activos bajo o en su stock mínimo configurado. */
export async function countLowStockProducts(storeId: string): Promise<number> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({ total: count() })
      .from(products)
      .where(
        and(
          eq(products.storeId, storeId),
          eq(products.isActive, true),
          eq(products.isService, false),
          gt(products.minimumStock, '0'),
          lte(products.currentStock, products.minimumStock),
        ),
      );
    return row?.total ?? 0;
  });
}

export async function getProduct(
  storeId: string,
  productId: string,
): Promise<ProductDetail | null> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({
        ...listColumns,
        description: products.description,
        sku: products.sku,
        unitId: products.unitId,
        unitName: units.name,
      })
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(suppliers, eq(suppliers.id, products.defaultSupplierId))
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)));
    if (!row) return null;

    const [priceHistory, movements] = await Promise.all([
      tx
        .select({
          id: productPriceHistory.id,
          oldCashPrice: productPriceHistory.oldCashPrice,
          newCashPrice: productPriceHistory.newCashPrice,
          oldCreditPrice: productPriceHistory.oldCreditPrice,
          newCreditPrice: productPriceHistory.newCreditPrice,
          reason: productPriceHistory.reason,
          userName: users.name,
          createdAt: productPriceHistory.createdAt,
        })
        .from(productPriceHistory)
        .innerJoin(users, eq(users.id, productPriceHistory.userId))
        .where(eq(productPriceHistory.productId, productId))
        .orderBy(desc(productPriceHistory.createdAt))
        .limit(50),
      tx
        .select({
          id: inventoryMovements.id,
          movementType: inventoryMovements.movementType,
          referenceId: inventoryMovements.referenceId,
          quantity: inventoryMovements.quantity,
          unitCost: inventoryMovements.unitCost,
          totalCost: inventoryMovements.totalCost,
          stockAfter: inventoryMovements.stockAfter,
          averageCostAfter: inventoryMovements.averageCostAfter,
          notes: inventoryMovements.notes,
          userName: users.name,
          createdAt: inventoryMovements.createdAt,
        })
        .from(inventoryMovements)
        .innerJoin(users, eq(users.id, inventoryMovements.userId))
        .where(eq(inventoryMovements.productId, productId))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(50),
    ]);

    return {
      ...row,
      priceHistory,
      movements: movements.map((m) => ({
        ...m,
        movementType: m.movementType as KardexMovementType,
      })),
    };
  });
}
