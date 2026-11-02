import { z } from 'zod';
import type {
  AdjustStockError,
  CreateProductError,
  RecordWasteError,
  UpdateProductError,
} from '@/core/application/catalog/manage-catalog';

const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.null()])
  .transform((value) => value !== null);

/** Forma del formulario del producto; las reglas de negocio las aplica el caso de uso. */
export const productFormSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(1000),
  brand: z.string().max(150),
  sku: z.string().max(80),
  barcode: z.string().max(80),
  unitId: z.string().max(40),
  defaultSupplierId: z.string().max(40),
  isService: checkbox,
  allowsInstallments: checkbox,
  cashPrice: z.string().max(20),
  creditPrice: z.string().max(20),
  minimumStock: z.string().max(20),
  initialStock: z.string().max(20),
  priceReason: z.string().max(300),
  removeImage: checkbox,
});

export type ProductForm = z.infer<typeof productFormSchema>;

export function readProductForm(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? '');
  return productFormSchema.safeParse({
    name: text('name'),
    description: text('description'),
    brand: text('brand'),
    sku: text('sku'),
    barcode: text('barcode'),
    unitId: text('unitId'),
    defaultSupplierId: text('defaultSupplierId'),
    isService: formData.get('isService'),
    allowsInstallments: formData.get('allowsInstallments'),
    cashPrice: text('cashPrice'),
    creditPrice: text('creditPrice'),
    minimumStock: text('minimumStock'),
    initialStock: text('initialStock'),
    priceReason: text('priceReason'),
    removeImage: formData.get('removeImage'),
  });
}

export type ProductField =
  | 'name'
  | 'brand'
  | 'sku'
  | 'barcode'
  | 'unitId'
  | 'defaultSupplierId'
  | 'cashPrice'
  | 'creditPrice'
  | 'minimumStock'
  | 'initialStock'
  | 'image'
  | 'isService'
  | 'form';

const QUANTITY_KEYS = {
  QUANTITY_INVALID: 'quantityInvalid',
  QUANTITY_NOT_WHOLE: 'quantityNotWhole',
  QUANTITY_NOT_POSITIVE: 'quantityInvalid',
} as const;

/** Error del caso de uso → campo y clave de `Inventory.form.errors`. */
export function productError(
  code: CreateProductError | UpdateProductError,
): [ProductField, string] {
  if (code.startsWith('INITIAL_STOCK_')) {
    return ['initialStock', QUANTITY_KEYS[code.slice(14) as keyof typeof QUANTITY_KEYS]];
  }
  if (code.startsWith('MINIMUM_STOCK_')) {
    return ['minimumStock', QUANTITY_KEYS[code.slice(14) as keyof typeof QUANTITY_KEYS]];
  }
  switch (code) {
    case 'NAME_REQUIRED':
      return ['name', 'nameRequired'];
    case 'BRAND_TOO_LONG':
      return ['brand', 'brandTooLong'];
    case 'SKU_INVALID':
      return ['sku', 'skuInvalid'];
    case 'BARCODE_INVALID':
      return ['barcode', 'barcodeInvalid'];
    case 'BARCODE_TAKEN':
      return ['barcode', 'barcodeTaken'];
    case 'UNIT_REQUIRED':
    case 'UNIT_NOT_FOUND':
      return ['unitId', 'unitRequired'];
    case 'SUPPLIER_NOT_FOUND':
      return ['defaultSupplierId', 'generic'];
    case 'CASH_PRICE_INVALID':
      return ['cashPrice', 'priceInvalid'];
    case 'CREDIT_PRICE_INVALID':
      return ['creditPrice', 'priceInvalid'];
    case 'CREDIT_BELOW_CASH':
      return ['creditPrice', 'creditBelowCash'];
    case 'IMAGE_TYPE':
      return ['image', 'imageType'];
    case 'IMAGE_TOO_LARGE':
      return ['image', 'imageTooLarge'];
    case 'SERVICE_HAS_STOCK':
      return ['isService', 'serviceHasStock'];
    case 'PLAN_LIMIT_REACHED':
      return ['form', 'planLimit'];
    default:
      return ['form', 'notFound'];
  }
}

export type AdjustField = 'countedStock' | 'reason' | 'form';

export function adjustError(code: AdjustStockError): [AdjustField, string] {
  if (code.startsWith('COUNTED_')) {
    return ['countedStock', QUANTITY_KEYS[code.slice(8) as keyof typeof QUANTITY_KEYS]];
  }
  if (code === 'REASON_REQUIRED') return ['reason', 'reasonRequired'];
  if (code === 'NO_CHANGE') return ['countedStock', 'noChange'];
  return ['form', 'notFound'];
}

export type WasteField = 'quantity' | 'reason' | 'form';

export function wasteError(code: RecordWasteError): [WasteField, string] {
  if (code.startsWith('WASTE_')) {
    return ['quantity', QUANTITY_KEYS[code.slice(6) as keyof typeof QUANTITY_KEYS]];
  }
  if (code === 'REASON_REQUIRED') return ['reason', 'reasonRequired'];
  if (code === 'INSUFFICIENT_STOCK') return ['quantity', 'insufficientStock'];
  return ['form', 'notFound'];
}
