import { Quantity } from '@/core/domain/catalog/quantity';
import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Producto tal como se lee, bloqueado, dentro de la transacción de la venta. */
export type SaleProduct = {
  id: string;
  name: string;
  isService: boolean;
  isActive: boolean;
  allowDecimals: boolean;
  allowsInstallments: boolean;
  currentStock: string;
  cashPrice: string;
  creditPrice: string;
  currentAverageCost: string;
};

export type CartLine = { productId: string; quantity: string };

export type SaleModality = 'CASH' | 'CREDIT';

export type PricedLine = {
  productId: string;
  isService: boolean;
  quantity: string;
  unitPrice: Money;
  subtotal: Money;
  /** Costo promedio congelado (US08 crit. 6), 4 decimales. */
  unitCost: string;
  lineCost: Money;
  /** Stock que queda; `null` en servicios. */
  stockAfter: string | null;
};

export type PricedSale = {
  lines: PricedLine[];
  total: Money;
  totalCost: Money;
  profit: Money;
  /** ¿Todos los ítems admiten cuotas? (D3). */
  allowsInstallments: boolean;
};

export type SalePricingError =
  | { code: 'EMPTY_CART' }
  | { code: 'TOO_MANY_LINES' }
  | { code: 'PRODUCT_UNAVAILABLE'; productId: string }
  | { code: 'QUANTITY_INVALID'; productId: string; productName: string }
  | { code: 'OUT_OF_STOCK'; productId: string; productName: string; available: string };

/** Un carrito de mostrador razonable; evita bloquear media tienda en una transacción. */
export const MAX_CART_LINES = 50;

/** Junta las líneas repetidas del mismo producto sumando sus cantidades (ya validadas). */
export function mergeCart(lines: readonly CartLine[]): CartLine[] {
  const merged = new Map<string, string>();
  for (const line of lines) {
    const previous = merged.get(line.productId);
    merged.set(line.productId, previous ? Quantity.plus(previous, line.quantity) : line.quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Precio, costo y stock de una venta con los productos ya bloqueados: contado
 * usa `cash_price` (US07 crit. 2) y fiado `credit_price` (US08 crit. 4). Si un
 * producto no alcanza, la venta entera se rechaza nombrando cuál (US07 crit. 6,
 * US08 crit. 3).
 */
export function priceSale(
  cart: readonly CartLine[],
  products: readonly SaleProduct[],
  modality: SaleModality,
): Result<PricedSale, SalePricingError> {
  const byId = new Map(products.map((p) => [p.id, p]));
  // Cada cantidad se valida antes de sumarse con otra línea del mismo producto
  const normalized: CartLine[] = [];
  for (const line of cart) {
    const quantity = Quantity.parse(line.quantity, { allowDecimals: true });
    if (!quantity.ok) {
      const product = byId.get(line.productId);
      if (!product) return err({ code: 'PRODUCT_UNAVAILABLE', productId: line.productId });
      return err({ code: 'QUANTITY_INVALID', productId: product.id, productName: product.name });
    }
    normalized.push({ productId: line.productId, quantity: quantity.value });
  }
  const merged = mergeCart(normalized);
  if (merged.length === 0) return err({ code: 'EMPTY_CART' });
  if (merged.length > MAX_CART_LINES) return err({ code: 'TOO_MANY_LINES' });

  const lines: PricedLine[] = [];
  for (const line of merged) {
    const product = byId.get(line.productId);
    if (!product || !product.isActive) {
      return err({ code: 'PRODUCT_UNAVAILABLE', productId: line.productId });
    }
    const quantity = Quantity.parse(line.quantity, { allowDecimals: product.allowDecimals });
    if (!quantity.ok) {
      return err({ code: 'QUANTITY_INVALID', productId: product.id, productName: product.name });
    }
    let stockAfter: string | null = null;
    if (!product.isService) {
      if (Quantity.compare(quantity.value, product.currentStock) > 0) {
        return err({
          code: 'OUT_OF_STOCK',
          productId: product.id,
          productName: product.name,
          available: product.currentStock,
        });
      }
      stockAfter = Quantity.minus(product.currentStock, quantity.value);
    }
    const unitPrice = Money.of(
      modality === 'CASH' ? product.cashPrice : product.creditPrice,
      'PEN',
    );
    lines.push({
      productId: product.id,
      isService: product.isService,
      quantity: quantity.value,
      unitPrice,
      subtotal: Money.of(Quantity.valuedAt(quantity.value, unitPrice.toFixed2()), 'PEN'),
      unitCost: product.currentAverageCost,
      lineCost: Money.of(Quantity.valuedAt(quantity.value, product.currentAverageCost), 'PEN'),
      stockAfter,
    });
  }

  const total = Money.sum(
    lines.map((l) => l.subtotal),
    'PEN',
  );
  const totalCost = Money.sum(
    lines.map((l) => l.lineCost),
    'PEN',
  );
  return ok({
    lines,
    total,
    totalCost,
    profit: total.minus(totalCost),
    allowsInstallments: lines.every((l) => byId.get(l.productId)!.allowsInstallments),
  });
}
