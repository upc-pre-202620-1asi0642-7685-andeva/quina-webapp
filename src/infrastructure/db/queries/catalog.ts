import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { productPriceHistory, products, units, users } from '../schema';
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

export type ProductDetail = ProductListItem & {
  description: string | null;
  sku: string | null;
  unitId: string;
  unitName: string;
  priceHistory: PriceChange[];
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
  imageUrl: products.imageUrl,
  unitCode: units.code,
  allowDecimals: units.allowDecimals,
  allowsInstallments: products.allowsInstallments,
};

/** Catálogo de la tienda con búsqueda por nombre, marca o código de barras. */
export async function listProducts(
  storeId: string,
  search = '',
  options: { activeOnly?: boolean } = {},
): Promise<ProductListItem[]> {
  const term = search.trim().replace(/[%_\\]/g, '');
  return withTenant(storeId, (tx) =>
    tx
      .select(listColumns)
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .where(
        and(
          eq(products.storeId, storeId),
          options.activeOnly ? eq(products.isActive, true) : undefined,
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
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)));
    if (!row) return null;
    const priceHistory = await tx
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
      .limit(50);
    return { ...row, priceHistory };
  });
}
