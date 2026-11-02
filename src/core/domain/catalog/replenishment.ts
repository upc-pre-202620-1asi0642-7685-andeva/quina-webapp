import { Dec } from '@/core/domain/shared/decimal';
import { Quantity } from './quantity';

export type ReplenishableProduct = {
  id: string;
  isService: boolean;
  isActive: boolean;
  currentStock: string;
  minimumStock: string;
  defaultSupplierId: string | null;
};

export type ReplenishmentDraft = {
  supplierId: string | null;
  items: { productId: string; quantity: string }[];
};

/**
 * US17 crit. 2 y 6: está en estado crítico cuando es producto físico activo,
 * tiene un stock mínimo configurado (`> 0`) y `current_stock <= minimum_stock`.
 */
export function isCriticalStock(product: {
  isService: boolean;
  isActive: boolean;
  currentStock: string;
  minimumStock: string;
}): boolean {
  if (!product.isActive || product.isService) return false;
  if (Quantity.isZero(product.minimumStock)) return false;
  return Quantity.compare(product.currentStock, product.minimumStock) <= 0;
}

/**
 * Cantidad sugerida para el borrador de pedido (`purchase_order_items.quantity > 0`):
 * `max(1, minimum_stock - current_stock)`.
 */
export function suggestedReplenishmentQuantity(product: {
  currentStock: string;
  minimumStock: string;
}): string {
  const diff = new Dec(product.minimumStock).minus(product.currentStock);
  return (diff.gt(1) ? diff : new Dec(1)).toFixed(3);
}

/**
 * US17 crit. 5: agrupa los productos críticos por su proveedor habitual
 * (`null` cuando el producto no tiene proveedor asignado).
 */
export function buildReplenishmentDrafts(
  products: Iterable<ReplenishableProduct>,
): ReplenishmentDraft[] {
  const bySupplier = new Map<string | null, { productId: string; quantity: string }[]>();
  for (const product of products) {
    if (!isCriticalStock(product)) continue;
    const key = product.defaultSupplierId ?? null;
    const list = bySupplier.get(key) ?? [];
    list.push({
      productId: product.id,
      quantity: suggestedReplenishmentQuantity(product),
    });
    bySupplier.set(key, list);
  }
  return [...bySupplier.entries()].map(([supplierId, items]) => ({ supplierId, items }));
}
