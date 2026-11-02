'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CreateSupplierUseCase,
  GenerateReplenishmentOrdersUseCase,
  RegisterPurchaseUseCase,
  type AttachmentUpload,
  type CreateSupplierError,
  type RegisterPurchaseError,
} from '@/core/application/catalog/manage-purchases';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { getPrivateFileStorage } from '@/infrastructure/storage/image-storage-factory';
import { authorizeStore } from '@/presentation/auth/guards';
import { actionRedirect } from '@/presentation/lib/action-redirect';

export type SupplierActionResult =
  | { ok: true; supplierId: string }
  | {
      ok: false;
      field: 'taxIdNumber' | 'tradeName' | 'contactName' | 'phone' | 'email' | 'form';
      error: string;
    };

export type PurchaseField =
  | 'supplierId'
  | 'documentType'
  | 'series'
  | 'documentNumber'
  | 'issueDate'
  | 'lines'
  | 'attachment'
  | 'form';

export type PurchaseFormState = {
  errors?: Partial<Record<PurchaseField, string>>;
};

const supplierInputSchema = z.object({
  taxIdNumber: z.string().max(30),
  tradeName: z.string().max(200),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(180).optional(),
});

const purchaseLineSchema = z.object({
  productId: z.string().max(40),
  quantity: z.string().max(20),
  unitCost: z.string().max(20),
});

function mapSupplierError(
  code: CreateSupplierError,
): ['taxIdNumber' | 'tradeName' | 'contactName' | 'phone' | 'email' | 'form', string] {
  switch (code) {
    case 'TAX_ID_INVALID':
      return ['taxIdNumber', 'taxIdInvalid'];
    case 'TAX_ID_TAKEN':
      return ['taxIdNumber', 'taxIdTaken'];
    case 'TRADE_NAME_REQUIRED':
      return ['tradeName', 'tradeNameRequired'];
    case 'CONTACT_TOO_LONG':
      return ['contactName', 'contactTooLong'];
    case 'PHONE_INVALID':
      return ['phone', 'phoneInvalid'];
    case 'EMAIL_INVALID':
      return ['email', 'emailInvalid'];
  }
}

function mapPurchaseError(code: RegisterPurchaseError): [PurchaseField, string] {
  switch (code) {
    case 'SUPPLIER_REQUIRED':
    case 'SUPPLIER_NOT_FOUND':
      return ['supplierId', 'supplierRequired'];
    case 'DOCUMENT_TYPE_INVALID':
      return ['documentType', 'documentTypeInvalid'];
    case 'SERIES_INVALID':
      return ['series', 'seriesInvalid'];
    case 'DOCUMENT_NUMBER_INVALID':
      return ['documentNumber', 'documentNumberInvalid'];
    case 'ISSUE_DATE_INVALID':
      return ['issueDate', 'issueDateInvalid'];
    case 'LINES_EMPTY':
      return ['lines', 'linesEmpty'];
    case 'DUPLICATE_PRODUCT':
      return ['lines', 'duplicateProduct'];
    case 'PRODUCT_NOT_FOUND':
    case 'PRODUCT_IS_SERVICE':
      return ['lines', 'productInvalid'];
    case 'QUANTITY_INVALID':
    case 'QUANTITY_NOT_POSITIVE':
      return ['lines', 'quantityInvalid'];
    case 'QUANTITY_NOT_WHOLE':
      return ['lines', 'quantityNotWhole'];
    case 'UNIT_COST_INVALID':
    case 'UNIT_COST_NOT_POSITIVE':
    case 'SUBTOTAL_ZERO':
      return ['lines', 'unitCostInvalid'];
    case 'ATTACHMENT_TYPE':
      return ['attachment', 'attachmentType'];
    case 'ATTACHMENT_TOO_LARGE':
      return ['attachment', 'attachmentTooLarge'];
    case 'RECEIPT_LIMIT_REACHED':
      return ['form', 'receiptLimit'];
  }
}

export async function createSupplierAction(input: {
  taxIdNumber: string;
  tradeName: string;
  contactName?: string;
  phone?: string;
  email?: string;
}): Promise<SupplierActionResult> {
  const user = await authorizeStore('purchases.manage');
  if (!user) return { ok: false, field: 'form', error: 'generic' };
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, field: 'form', error: 'generic' };

  const result = await new CreateSupplierUseCase(new DrizzlePurchaseRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    input: parsed.data,
    now: new Date(),
  });
  if (!result.ok) {
    const [field, error] = mapSupplierError(result.error);
    return { ok: false, field, error };
  }
  revalidatePath('/inventory');
  revalidatePath('/inventory/purchases');
  revalidatePath('/inventory/purchases/new');
  return { ok: true, supplierId: result.value };
}

async function readAttachments(formData: FormData): Promise<AttachmentUpload[]> {
  const entries = formData.getAll('attachments');
  const uploads: AttachmentUpload[] = [];
  for (const entry of entries) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    uploads.push({
      fileName: entry.name || 'comprobante',
      contentType: entry.type,
      bytes: new Uint8Array(await entry.arrayBuffer()),
    });
  }
  return uploads;
}

export async function registerPurchaseAction(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const user = await authorizeStore('purchases.manage');
  if (!user) return actionRedirect('/login');

  const text = (name: string) => String(formData.get(name) ?? '');
  let rawLines: unknown = [];
  try {
    rawLines = JSON.parse(text('linesJson') || '[]');
  } catch {
    return { errors: { lines: 'linesEmpty' } };
  }
  const linesParsed = z.array(purchaseLineSchema).max(100).safeParse(rawLines);
  if (!linesParsed.success) return { errors: { lines: 'linesEmpty' } };

  const attachments = await readAttachments(formData);
  const purchaseOrderId = text('purchaseOrderId').trim() || null;

  const result = await new RegisterPurchaseUseCase(
    new DrizzlePurchaseRepository(),
    getPrivateFileStorage(),
  ).execute({
    storeId: user.storeId,
    actorId: user.id,
    purchaseOrderId,
    input: {
      supplierId: text('supplierId'),
      documentType: text('documentType'),
      series: text('series'),
      documentNumber: text('documentNumber'),
      issueDate: text('issueDate'),
      notes: text('notes'),
      lines: linesParsed.data,
    },
    attachments,
    now: new Date(),
  });

  if (!result.ok) {
    const [field, key] = mapPurchaseError(result.error);
    return { errors: { [field]: key } };
  }

  revalidatePath('/inventory');
  revalidatePath('/inventory/purchases');
  return actionRedirect(`/inventory/purchases/${result.value}?notice=created`);
}

export async function generateReplenishmentOrdersAction(): Promise<
  { ok: true; createdCount: number } | { ok: false; error: string }
> {
  const user = await authorizeStore('purchases.manage');
  if (!user) return { ok: false, error: 'generic' };
  const result = await new GenerateReplenishmentOrdersUseCase(
    new DrizzlePurchaseRepository(),
  ).execute({
    storeId: user.storeId,
    actorId: user.id,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: 'noLowStock' };
  revalidatePath('/inventory');
  revalidatePath('/inventory/purchases');
  return { ok: true, createdCount: result.value.createdCount };
}

export async function discardPurchaseOrderAction(orderId: string): Promise<{ ok: boolean }> {
  const user = await authorizeStore('purchases.manage');
  if (!user || !z.uuid().safeParse(orderId).success) return { ok: false };
  const result = await new DrizzlePurchaseRepository().discardPurchaseOrder({
    storeId: user.storeId,
    actorId: user.id,
    orderId,
    now: new Date(),
  });
  revalidatePath('/inventory/purchases');
  return { ok: result === 'OK' };
}
