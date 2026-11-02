import { BusinessDate } from '@/core/domain/shared/business-date';
import { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';
import { Quantity, type QuantityError } from './quantity';
import { UnitCost, type UnitCostError } from './unit-cost';

export const PURCHASE_DOCUMENT_TYPES = ['FACTURA', 'BOLETA', 'GUIA_REMISION', 'RECIBO'] as const;
export type PurchaseDocumentType = (typeof PURCHASE_DOCUMENT_TYPES)[number];

export type PurchaseProductInfo = {
  id: string;
  isService: boolean;
  allowDecimals: boolean;
};

export type PurchaseLineInput = {
  productId: string;
  quantity: string;
  unitCost: string;
};

export type ParsedPurchaseLine = {
  productId: string;
  quantity: string;
  unitCost: string;
  subtotal: string;
};

export type PurchaseInput = {
  supplierId: string;
  documentType: string;
  series?: string | undefined;
  documentNumber: string;
  issueDate: string;
  notes?: string | undefined;
  lines: PurchaseLineInput[];
};

export type ParsedPurchase = {
  supplierId: string;
  documentType: PurchaseDocumentType;
  series: string | null;
  documentNumber: string;
  issueDate: string;
  notes: string | null;
  totalAmount: string;
  lines: ParsedPurchaseLine[];
};

export type PurchaseError =
  | 'SUPPLIER_REQUIRED'
  | 'DOCUMENT_TYPE_INVALID'
  | 'SERIES_INVALID'
  | 'DOCUMENT_NUMBER_INVALID'
  | 'ISSUE_DATE_INVALID'
  | 'LINES_EMPTY'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_IS_SERVICE'
  | 'DUPLICATE_PRODUCT'
  | 'SUBTOTAL_ZERO'
  | QuantityError
  | UnitCostError;

const SERIES = /^[A-Za-z0-9-]{1,10}$/;
const DOC_NUMBER = /^[A-Za-z0-9-]{1,20}$/;

function isDocumentType(value: string): value is PurchaseDocumentType {
  return (PURCHASE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function parsePurchase(
  input: PurchaseInput,
  productsById: ReadonlyMap<string, PurchaseProductInfo>,
): Result<ParsedPurchase, PurchaseError> {
  const supplierId = input.supplierId.trim();
  if (!supplierId) return err('SUPPLIER_REQUIRED');
  if (!isDocumentType(input.documentType)) return err('DOCUMENT_TYPE_INVALID');

  const rawSeries = (input.series ?? '').trim().toUpperCase();
  if (rawSeries && !SERIES.test(rawSeries)) return err('SERIES_INVALID');
  const series = rawSeries || null;

  const documentNumber = input.documentNumber.trim().toUpperCase();
  if (!DOC_NUMBER.test(documentNumber)) return err('DOCUMENT_NUMBER_INVALID');

  let issueDate: string;
  try {
    issueDate = BusinessDate.toISO(BusinessDate.parse(input.issueDate.trim()));
  } catch {
    return err('ISSUE_DATE_INVALID');
  }

  if (input.lines.length === 0) return err('LINES_EMPTY');

  const seen = new Set<string>();
  const lines: ParsedPurchaseLine[] = [];
  let total = Money.zero('PEN');

  for (const rawLine of input.lines) {
    const product = productsById.get(rawLine.productId);
    if (!product) return err('PRODUCT_NOT_FOUND');
    if (product.isService) return err('PRODUCT_IS_SERVICE');
    if (seen.has(product.id)) return err('DUPLICATE_PRODUCT');
    seen.add(product.id);

    const qty = Quantity.parse(rawLine.quantity, {
      allowDecimals: product.allowDecimals,
      allowZero: false,
    });
    if (!qty.ok) return qty;

    const cost = UnitCost.parse(rawLine.unitCost);
    if (!cost.ok) return cost;

    const subtotal = Quantity.valuedAt(qty.value, cost.value);
    const subtotalMoney = Money.of(subtotal, 'PEN');
    if (!subtotalMoney.isPositive()) return err('SUBTOTAL_ZERO');

    total = total.plus(subtotalMoney);
    lines.push({
      productId: product.id,
      quantity: qty.value,
      unitCost: cost.value,
      subtotal: subtotalMoney.toFixed2(),
    });
  }

  const notes = (input.notes ?? '').trim().slice(0, 500) || null;
  return ok({
    supplierId,
    documentType: input.documentType,
    series,
    documentNumber,
    issueDate,
    notes,
    totalAmount: total.toFixed2(),
    lines,
  });
}
