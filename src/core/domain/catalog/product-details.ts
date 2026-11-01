import { err, ok, type Result } from '@/core/domain/shared/result';

/** Ficha del producto o servicio (US03 crit. 1 y 2), ya validada. */
export type ProductDetails = {
  name: string;
  description: string | null;
  brand: string | null;
  sku: string | null;
  barcode: string | null;
  unitId: string;
  isService: boolean;
  allowsInstallments: boolean;
};

export type ProductDetailsInput = {
  name: string;
  description: string;
  brand: string;
  sku: string;
  barcode: string;
  unitId: string;
  isService: boolean;
  allowsInstallments: boolean;
};

export type ProductDetailsError =
  'NAME_REQUIRED' | 'BRAND_TOO_LONG' | 'SKU_INVALID' | 'BARCODE_INVALID' | 'UNIT_REQUIRED';

const clean = (raw: string) => raw.trim().replace(/\s+/g, ' ');
const optional = (raw: string) => clean(raw) || null;
const CODE = /^[A-Za-z0-9._-]{1,50}$/;

export function parseProductDetails(
  input: ProductDetailsInput,
): Result<ProductDetails, ProductDetailsError> {
  const name = clean(input.name);
  if (name.length < 2 || name.length > 150) return err('NAME_REQUIRED');
  const brand = optional(input.brand);
  if (brand && brand.length > 100) return err('BRAND_TOO_LONG');
  const sku = optional(input.sku);
  if (sku && !CODE.test(sku)) return err('SKU_INVALID');
  const barcode = optional(input.barcode);
  if (barcode && !/^\d{6,14}$/.test(barcode)) return err('BARCODE_INVALID');
  if (!input.unitId) return err('UNIT_REQUIRED');
  return ok({
    name,
    // La descripción conserva sus saltos de línea
    description: input.description.trim() || null,
    brand,
    sku,
    barcode,
    unitId: input.unitId,
    isService: input.isService,
    allowsInstallments: input.allowsInstallments,
  });
}
