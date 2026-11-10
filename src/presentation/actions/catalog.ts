'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  AdjustStockUseCase,
  CreateProductUseCase,
  RecordWasteUseCase,
  SetProductActiveUseCase,
  UpdateProductUseCase,
  type ImageUpload,
} from '@/core/application/catalog/manage-catalog';
import { getProduct } from '@/infrastructure/db/queries/catalog';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { getImageStorage } from '@/infrastructure/storage/image-storage-factory';
import { authorizeStore } from '@/presentation/auth/guards';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import {
  adjustError,
  productError,
  readProductForm,
  wasteError,
  type AdjustField,
  type ProductField,
  type ProductForm,
  type WasteField,
} from '@/presentation/validation/product-form';

export type ProductFormState = { errors?: Partial<Record<ProductField, string>> };
export type AdjustStockState = { errors?: Partial<Record<AdjustField, string>> };
export type RecordWasteState = { errors?: Partial<Record<WasteField, string>> };
export type CatalogActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

async function readImage(formData: FormData): Promise<ImageUpload | null> {
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return null;
  return { contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function details(form: ProductForm) {
  return {
    name: form.name,
    description: form.description,
    brand: form.brand,
    sku: form.sku,
    barcode: form.barcode,
    unitId: form.unitId,
    defaultSupplierId: form.defaultSupplierId.trim() || null,
    isService: form.isService,
    allowsInstallments: form.allowsInstallments,
  };
}

/** US03: solo el dueño da de alta productos y servicios (D5). */
export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await authorizeStore('catalog.manage');
  if (!user) return actionRedirect('/login');
  const parsed = readProductForm(formData);
  if (!parsed.success) return { errors: { form: 'generic' } };

  const result = await new CreateProductUseCase(
    new DrizzleProductRepository(),
    getImageStorage(),
  ).execute({
    storeId: user.storeId,
    actorId: user.id,
    details: details(parsed.data),
    cashPrice: parsed.data.cashPrice,
    creditPrice: parsed.data.creditPrice,
    minimumStock: parsed.data.minimumStock,
    initialStock: parsed.data.initialStock,
    image: await readImage(formData),
    now: new Date(),
  });
  if (!result.ok) {
    const [field, key] = productError(result.error);
    return { errors: { [field]: key } };
  }
  revalidatePath('/inventory');
  return actionRedirect(`/inventory/${result.value}?notice=created`);
}

/** US03 crit. 4: cambiar precios exige el permiso de precios y deja historial. */
export async function updateProductAction(
  productId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await authorizeStore('catalog.manage');
  if (!user || !(await authorizeStore('catalog.prices'))) return actionRedirect('/login');
  if (!idSchema.safeParse(productId).success) return { errors: { form: 'notFound' } };
  const parsed = readProductForm(formData);
  if (!parsed.success) return { errors: { form: 'generic' } };

  const result = await new UpdateProductUseCase(
    new DrizzleProductRepository(),
    getImageStorage(),
  ).execute({
    storeId: user.storeId,
    actorId: user.id,
    productId,
    details: details(parsed.data),
    cashPrice: parsed.data.cashPrice,
    creditPrice: parsed.data.creditPrice,
    minimumStock: parsed.data.minimumStock,
    priceReason: parsed.data.priceReason,
    image: await readImage(formData),
    removeImage: parsed.data.removeImage,
    now: new Date(),
  });
  if (!result.ok) {
    const [field, key] = productError(result.error);
    return { errors: { [field]: key } };
  }
  revalidatePath('/inventory');
  return actionRedirect(`/inventory/${productId}?notice=saved`);
}

export async function setProductActiveAction(
  productId: string,
  active: boolean,
): Promise<CatalogActionResult> {
  const user = await authorizeStore('catalog.manage', { allowWhenReadOnly: !active });
  if (!user || !idSchema.safeParse(productId).success) return { ok: false, error: 'generic' };
  const result = await new SetProductActiveUseCase(new DrizzleProductRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    productId,
    active,
    now: new Date(),
  });
  if (!result.ok) {
    return { ok: false, error: result.error === 'PLAN_LIMIT_REACHED' ? 'planLimit' : 'generic' };
  }
  revalidatePath('/inventory');
  revalidatePath(`/inventory/${productId}`);
  return { ok: true };
}

/** D1: conteo físico del dueño hasta que lleguen las compras (US15). */
export async function adjustStockAction(
  productId: string,
  _prev: AdjustStockState,
  formData: FormData,
): Promise<AdjustStockState> {
  const user = await authorizeStore('catalog.manage');
  if (!user) return actionRedirect('/login');
  if (!idSchema.safeParse(productId).success) return { errors: { form: 'notFound' } };
  // La unidad sale de la base, no del formulario
  const product = await getProduct(user.storeId, productId);
  if (!product) return { errors: { form: 'notFound' } };

  const result = await new AdjustStockUseCase(new DrizzleProductRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    productId,
    allowDecimals: product.allowDecimals,
    countedStock: String(formData.get('countedStock') ?? '').slice(0, 20),
    reason: String(formData.get('reason') ?? '').slice(0, 400),
    now: new Date(),
  });
  if (!result.ok) {
    const [field, key] = adjustError(result.error);
    return { errors: { [field]: key } };
  }
  revalidatePath('/inventory');
  return actionRedirect(`/inventory/${productId}?notice=stockAdjusted`);
}

/** US16 crit. 4: merma por mercadería dañada o vencida con motivo obligatorio. */
export async function recordWasteAction(
  productId: string,
  _prev: RecordWasteState,
  formData: FormData,
): Promise<RecordWasteState> {
  const user = await authorizeStore('catalog.manage');
  if (!user) return actionRedirect('/login');
  if (!idSchema.safeParse(productId).success) return { errors: { form: 'notFound' } };
  const product = await getProduct(user.storeId, productId);
  if (!product) return { errors: { form: 'notFound' } };

  const result = await new RecordWasteUseCase(new DrizzleProductRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    productId,
    allowDecimals: product.allowDecimals,
    quantity: String(formData.get('quantity') ?? '').slice(0, 20),
    reason: String(formData.get('reason') ?? '').slice(0, 400),
    now: new Date(),
  });
  if (!result.ok) {
    const [field, key] = wasteError(result.error);
    return { errors: { [field]: key } };
  }
  revalidatePath('/inventory');
  return actionRedirect(`/inventory/${productId}?notice=wasteRecorded`);
}
