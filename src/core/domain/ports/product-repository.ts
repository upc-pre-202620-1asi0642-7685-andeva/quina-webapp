import type { Subscription } from '../billing/plan-limits';
import type { ProductDetails } from '../catalog/product-details';

export type Unit = { id: string; code: string; name: string; allowDecimals: boolean };

/** Precios como texto con 2 decimales, listos para `NUMERIC(12, 2)`. */
export type PriceColumns = { cash: string; credit: string };

/**
 * Decide, con la suscripción bloqueada, si cabe un producto activo más (US26).
 * El repositorio la llama dentro de la transacción para evitar carreras.
 */
export type AddProductGuard = (subscription: Subscription, activeProducts: number) => boolean;

export type CreateProductData = {
  storeId: string;
  actorId: string;
  details: ProductDetails;
  prices: PriceColumns;
  /** `0.000` si no hay stock inicial (D1). Un servicio siempre llega en cero. */
  initialStock: string;
  minimumStock: string;
  image: { path: string; url: string } | null;
  canAdd: AddProductGuard;
  now: Date;
};

export type UpdateProductData = {
  storeId: string;
  actorId: string;
  productId: string;
  details: ProductDetails;
  prices: PriceColumns;
  minimumStock: string;
  priceReason: string | null;
  /** `undefined` deja la imagen actual; `null` la quita. */
  image: { path: string; url: string } | null | undefined;
  now: Date;
};

export type UpdateProductResult =
  | { status: 'OK'; previousImageUrl: string | null }
  | { status: 'NOT_FOUND' | 'BARCODE_TAKEN' | 'UNIT_NOT_FOUND' | 'SERVICE_HAS_STOCK' };

export type SetProductActiveData = {
  storeId: string;
  actorId: string;
  productId: string;
  active: boolean;
  canAdd: AddProductGuard;
  now: Date;
};

export type AdjustStockData = {
  storeId: string;
  actorId: string;
  productId: string;
  /** Lo que se contó en el estante; la diferencia va al kardex. */
  countedStock: string;
  reason: string;
  now: Date;
};

export interface ProductRepository {
  units(storeId: string): Promise<Unit[]>;
  /** Inserta producto, stock inicial en el kardex y auditoría en una transacción. */
  create(
    data: CreateProductData,
  ): Promise<{ productId: string } | 'PLAN_LIMIT_REACHED' | 'BARCODE_TAKEN' | 'UNIT_NOT_FOUND'>;
  /** Cambia la ficha; si cambian los precios guarda el historial en la misma transacción. */
  update(data: UpdateProductData): Promise<UpdateProductResult>;
  setActive(data: SetProductActiveData): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'>;
  /** Conteo físico (`COUNT_ADJUSTMENT`) hasta que lleguen las compras (D1). */
  adjustStock(data: AdjustStockData): Promise<'OK' | 'NOT_FOUND' | 'IS_SERVICE' | 'NO_CHANGE'>;
}
