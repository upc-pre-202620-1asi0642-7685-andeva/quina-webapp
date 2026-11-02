import type { Subscription } from '@/core/domain/billing/plan-limits';
import type { ProductDetails } from '@/core/domain/catalog/product-details';
import { Quantity } from '@/core/domain/catalog/quantity';
import type { ImageStorage, StoredImage } from '@/core/domain/ports/image-storage';
import type {
  AdjustStockData,
  CreateProductData,
  PriceColumns,
  ProductRepository,
  RecordWasteData,
  SetProductActiveData,
  Unit,
  UpdateProductData,
  UpdateProductResult,
} from '@/core/domain/ports/product-repository';

export type FakeProduct = {
  storeId: string;
  details: ProductDetails;
  prices: PriceColumns;
  stock: string;
  minimumStock: string;
  imageUrl: string | null;
  active: boolean;
};

export type FakeMovement = { productId: string; quantity: string; notes: string | null };
export type FakePriceChange = { productId: string; before: PriceColumns; after: PriceColumns };

/** Catálogo en memoria: productos, kardex e historial de precios. */
export class InMemoryCatalog implements ProductRepository {
  readonly products = new Map<string, FakeProduct>();
  readonly movements: FakeMovement[] = [];
  readonly priceHistory: FakePriceChange[] = [];
  readonly subscriptions = new Map<string, Subscription>();
  unitsByStore = new Map<string, Unit[]>();
  private nextId = 1;

  seedUnits(storeId: string): Unit[] {
    const units: Unit[] = [
      { id: `${storeId}-UND`, code: 'UND', name: 'Unidad', allowDecimals: false },
      { id: `${storeId}-KG`, code: 'KG', name: 'Kilogramo', allowDecimals: true },
    ];
    this.unitsByStore.set(storeId, units);
    return units;
  }

  async units(storeId: string): Promise<Unit[]> {
    return this.unitsByStore.get(storeId) ?? [];
  }

  async create(
    data: CreateProductData,
  ): Promise<{ productId: string } | 'PLAN_LIMIT_REACHED' | 'BARCODE_TAKEN' | 'UNIT_NOT_FOUND'> {
    if (!data.canAdd(this.subscriptionOf(data.storeId), this.activeCount(data.storeId))) {
      return 'PLAN_LIMIT_REACHED';
    }
    if (this.barcodeTaken(data.storeId, data.details.barcode)) return 'BARCODE_TAKEN';
    const productId = `p-${this.nextId++}`;
    this.products.set(productId, {
      storeId: data.storeId,
      details: data.details,
      prices: data.prices,
      stock: data.initialStock,
      minimumStock: data.minimumStock,
      imageUrl: data.image?.url ?? null,
      active: true,
    });
    if (!Quantity.isZero(data.initialStock)) {
      this.movements.push({ productId, quantity: data.initialStock, notes: 'Stock inicial' });
    }
    return { productId };
  }

  async update(data: UpdateProductData): Promise<UpdateProductResult> {
    const product = this.productOf(data.storeId, data.productId);
    if (!product) return { status: 'NOT_FOUND' };
    if (this.barcodeTaken(data.storeId, data.details.barcode, data.productId)) {
      return { status: 'BARCODE_TAKEN' };
    }
    if (data.details.isService && !Quantity.isZero(product.stock)) {
      return { status: 'SERVICE_HAS_STOCK' };
    }
    const before = product.prices;
    if (before.cash !== data.prices.cash || before.credit !== data.prices.credit) {
      this.priceHistory.push({ productId: data.productId, before, after: data.prices });
    }
    const previousImageUrl = product.imageUrl;
    product.details = data.details;
    product.prices = data.prices;
    product.minimumStock = data.minimumStock;
    if (data.image !== undefined) product.imageUrl = data.image?.url ?? null;
    return { status: 'OK', previousImageUrl };
  }

  async setActive(data: SetProductActiveData): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'> {
    const product = this.productOf(data.storeId, data.productId);
    if (!product) return 'NOT_FOUND';
    if (
      data.active &&
      !product.active &&
      !data.canAdd(this.subscriptionOf(data.storeId), this.activeCount(data.storeId))
    ) {
      return 'PLAN_LIMIT_REACHED';
    }
    product.active = data.active;
    return 'OK';
  }

  async adjustStock(
    data: AdjustStockData,
  ): Promise<'OK' | 'NOT_FOUND' | 'IS_SERVICE' | 'NO_CHANGE'> {
    const product = this.productOf(data.storeId, data.productId);
    if (!product) return 'NOT_FOUND';
    if (product.details.isService) return 'IS_SERVICE';
    const difference = Quantity.minus(data.countedStock, product.stock);
    if (Quantity.isZero(difference)) return 'NO_CHANGE';
    this.movements.push({ productId: data.productId, quantity: difference, notes: data.reason });
    product.stock = data.countedStock;
    return 'OK';
  }

  async recordWaste(
    data: RecordWasteData,
  ): Promise<'OK' | 'NOT_FOUND' | 'IS_SERVICE' | 'INSUFFICIENT_STOCK'> {
    const product = this.productOf(data.storeId, data.productId);
    if (!product) return 'NOT_FOUND';
    if (product.details.isService) return 'IS_SERVICE';
    if (Quantity.compare(data.quantity, product.stock) > 0) return 'INSUFFICIENT_STOCK';
    const exit = Quantity.minus('0', data.quantity);
    this.movements.push({ productId: data.productId, quantity: exit, notes: data.reason });
    product.stock = Quantity.minus(product.stock, data.quantity);
    return 'OK';
  }

  private productOf(storeId: string, productId: string): FakeProduct | undefined {
    const product = this.products.get(productId);
    return product?.storeId === storeId ? product : undefined;
  }

  private barcodeTaken(storeId: string, barcode: string | null, except?: string): boolean {
    if (!barcode) return false;
    return [...this.products].some(
      ([id, p]) => id !== except && p.storeId === storeId && p.details.barcode === barcode,
    );
  }

  private activeCount(storeId: string): number {
    return [...this.products.values()].filter((p) => p.storeId === storeId && p.active).length;
  }

  private subscriptionOf(storeId: string): Subscription {
    return (
      this.subscriptions.get(storeId) ?? { planTier: 'CASERO', status: 'ACTIVE', trialEndsAt: null }
    );
  }
}

export class FakeImageStorage implements ImageStorage {
  readonly files = new Map<string, Uint8Array>();
  readonly removed: string[] = [];

  async upload(input: { path: string; bytes: Uint8Array }): Promise<StoredImage> {
    const url = `https://img.test/${input.path}`;
    this.files.set(url, input.bytes);
    return { path: input.path, url };
  }

  async remove(url: string): Promise<void> {
    this.removed.push(url);
    this.files.delete(url);
  }
}
