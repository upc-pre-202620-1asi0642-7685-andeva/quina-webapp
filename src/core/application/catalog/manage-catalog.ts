import { PlanLimits } from '@/core/domain/billing/plan-limits';
import {
  parseProductDetails,
  type ProductDetails,
  type ProductDetailsError,
  type ProductDetailsInput,
} from '@/core/domain/catalog/product-details';
import { ProductImage, type ProductImageError } from '@/core/domain/catalog/product-image';
import { ProductPrices, type ProductPricesError } from '@/core/domain/catalog/product-prices';
import { Quantity, type QuantityError } from '@/core/domain/catalog/quantity';
import type { ImageStorage, StoredImage } from '@/core/domain/ports/image-storage';
import type {
  AddProductGuard,
  ProductRepository,
  Unit,
} from '@/core/domain/ports/product-repository';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** US26 crit. 2: el producto 51 de Casero se bloquea; cuentan solo los activos (D10). */
export function activeProductGuard(now: Date): AddProductGuard {
  return (subscription, activeProducts) =>
    PlanLimits.canAdd(PlanLimits.effectiveTier(subscription, now), 'products', activeProducts);
}

export type ImageUpload = { contentType: string; bytes: Uint8Array };

type ProductForm = {
  storeId: string;
  actorId: string;
  details: ProductDetailsInput;
  cashPrice: string;
  creditPrice: string;
  minimumStock: string;
  now: Date;
};

export type CreateProductCommand = ProductForm & {
  initialStock: string;
  image: ImageUpload | null;
};

export type UpdateProductCommand = ProductForm & {
  productId: string;
  priceReason: string;
  image: ImageUpload | null;
  removeImage: boolean;
};

type StockField = 'INITIAL_STOCK' | 'MINIMUM_STOCK';

export type ProductFormError =
  | ProductDetailsError
  | ProductPricesError
  | ProductImageError
  | `${StockField}_${QuantityError}`
  | 'UNIT_NOT_FOUND'
  | 'BARCODE_TAKEN';

export type CreateProductError = ProductFormError | 'PLAN_LIMIT_REACHED';
export type UpdateProductError = ProductFormError | 'NOT_FOUND' | 'SERVICE_HAS_STOCK';

type Parsed = {
  details: ProductDetails;
  prices: { cash: string; credit: string };
  minimumStock: string;
  unit: Unit;
};

async function parseForm(
  products: ProductRepository,
  form: ProductForm,
): Promise<Result<Parsed, ProductFormError>> {
  const details = parseProductDetails(form.details);
  if (!details.ok) return details;
  const prices = ProductPrices.parse(form.cashPrice, form.creditPrice);
  if (!prices.ok) return prices;
  const unit = (await products.units(form.storeId)).find((u) => u.id === details.value.unitId);
  if (!unit) return err('UNIT_NOT_FOUND');

  // Un servicio no lleva stock (US03 crit. 2; chk_products_service_stock)
  let minimumStock = '0.000';
  if (!details.value.isService && form.minimumStock.trim()) {
    const parsed = Quantity.parse(form.minimumStock, {
      allowDecimals: unit.allowDecimals,
      allowZero: true,
    });
    if (!parsed.ok) return err(`MINIMUM_STOCK_${parsed.error}` as const);
    minimumStock = parsed.value;
  }
  return ok({
    details: details.value,
    prices: { cash: prices.value.cash.toFixed2(), credit: prices.value.credit.toFixed2() },
    minimumStock,
    unit,
  });
}

function parseImage(image: ImageUpload | null): Result<ProductImage | null, ProductImageError> {
  if (!image) return ok(null);
  return ProductImage.parse(image.contentType, image.bytes);
}

async function store(
  images: ImageStorage,
  storeId: string,
  image: ProductImage,
): Promise<StoredImage> {
  return images.upload({
    path: `${storeId}/${crypto.randomUUID()}.${image.extension}`,
    contentType: image.contentType,
    bytes: image.bytes,
  });
}

export class CreateProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly images: ImageStorage,
  ) {}

  async execute(command: CreateProductCommand): Promise<Result<string, CreateProductError>> {
    const form = await parseForm(this.products, command);
    if (!form.ok) return form;
    let initialStock = '0.000';
    if (!form.value.details.isService && command.initialStock.trim()) {
      const parsed = Quantity.parse(command.initialStock, {
        allowDecimals: form.value.unit.allowDecimals,
        allowZero: true,
      });
      if (!parsed.ok) return err(`INITIAL_STOCK_${parsed.error}` as const);
      initialStock = parsed.value;
    }
    const image = parseImage(command.image);
    if (!image.ok) return image;

    // La imagen sube después de validar todo y se borra si la fila no se guarda
    const stored = image.value ? await store(this.images, command.storeId, image.value) : null;
    const created = await this.products
      .create({
        storeId: command.storeId,
        actorId: command.actorId,
        details: form.value.details,
        prices: form.value.prices,
        initialStock,
        minimumStock: form.value.minimumStock,
        image: stored,
        canAdd: activeProductGuard(command.now),
        now: command.now,
      })
      .catch(async (error: unknown) => {
        if (stored) await this.images.remove(stored.url);
        throw error;
      });
    if (typeof created === 'string') {
      if (stored) await this.images.remove(stored.url);
      return err(created);
    }
    return ok(created.productId);
  }
}

export class UpdateProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly images: ImageStorage,
  ) {}

  async execute(command: UpdateProductCommand): Promise<Result<void, UpdateProductError>> {
    const form = await parseForm(this.products, command);
    if (!form.ok) return form;
    const image = parseImage(command.image);
    if (!image.ok) return image;

    const stored = image.value ? await store(this.images, command.storeId, image.value) : null;
    const result = await this.products
      .update({
        storeId: command.storeId,
        actorId: command.actorId,
        productId: command.productId,
        details: form.value.details,
        prices: form.value.prices,
        minimumStock: form.value.minimumStock,
        priceReason: command.priceReason.trim() || null,
        image: stored ?? (command.removeImage ? null : undefined),
        now: command.now,
      })
      .catch(async (error: unknown) => {
        if (stored) await this.images.remove(stored.url);
        throw error;
      });
    if (result.status !== 'OK') {
      if (stored) await this.images.remove(stored.url);
      return err(result.status);
    }
    // La imagen reemplazada o quitada ya no la usa nadie
    const previous = result.previousImageUrl;
    if ((stored || command.removeImage) && previous && previous !== stored?.url) {
      await this.images.remove(previous);
    }
    return ok(undefined);
  }
}

export class SetProductActiveUseCase {
  constructor(private readonly products: ProductRepository) {}

  /** Dar de baja libera el cupo del plan; reactivar vuelve a contarlo (D10). */
  async execute(command: {
    storeId: string;
    actorId: string;
    productId: string;
    active: boolean;
    now: Date;
  }): Promise<Result<void, 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'>> {
    const result = await this.products.setActive({
      ...command,
      canAdd: activeProductGuard(command.now),
    });
    return result === 'OK' ? ok(undefined) : err(result);
  }
}

export type AdjustStockError =
  `COUNTED_${QuantityError}` | 'REASON_REQUIRED' | 'NOT_FOUND' | 'IS_SERVICE' | 'NO_CHANGE';

export class AdjustStockUseCase {
  constructor(private readonly products: ProductRepository) {}

  /** Conteo físico con motivo obligatorio (D1; chk_inventory_reason). */
  async execute(command: {
    storeId: string;
    actorId: string;
    productId: string;
    allowDecimals: boolean;
    countedStock: string;
    reason: string;
    now: Date;
  }): Promise<Result<void, AdjustStockError>> {
    const counted = Quantity.parse(command.countedStock, {
      allowDecimals: command.allowDecimals,
      allowZero: true,
    });
    if (!counted.ok) return err(`COUNTED_${counted.error}` as const);
    const reason = command.reason.trim().replace(/\s+/g, ' ');
    if (reason.length < 3) return err('REASON_REQUIRED');
    const result = await this.products.adjustStock({
      storeId: command.storeId,
      actorId: command.actorId,
      productId: command.productId,
      countedStock: counted.value,
      reason: reason.slice(0, 300),
      now: command.now,
    });
    return result === 'OK' ? ok(undefined) : err(result);
  }
}
