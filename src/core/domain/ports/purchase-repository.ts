import type { Subscription } from '../billing/plan-limits';
import type { ParsedPurchase, PurchaseProductInfo } from '../catalog/purchase';
import type { AttachmentMimeType } from '../catalog/purchase-attachment';
import type { ReplenishmentDraft } from '../catalog/replenishment';
import type { SupplierDetails } from '../catalog/supplier';

export type SupplierOption = {
  id: string;
  taxIdNumber: string;
  tradeName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

export type StoredAttachment = {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: AttachmentMimeType;
};

/**
 * Decide, con la suscripción bloqueada, si la tienda puede adjuntar `adding`
 * comprobantes más en el mes actual (US15, US26).
 */
export type AddReceiptsGuard = (
  subscription: Subscription,
  receiptsThisMonth: number,
  adding: number,
) => boolean;

export type RegisterPurchaseData = {
  storeId: string;
  actorId: string;
  purchaseOrderId: string | null;
  purchase: ParsedPurchase;
  attachments: StoredAttachment[];
  canAttach: AddReceiptsGuard;
  now: Date;
};

export type RegisterPurchaseResult =
  | { status: 'OK'; purchaseId: string }
  | {
      status:
        'SUPPLIER_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'PRODUCT_IS_SERVICE' | 'RECEIPT_LIMIT_REACHED';
    };

export type CreateSupplierData = {
  storeId: string;
  actorId: string;
  details: SupplierDetails;
  now: Date;
};

export interface PurchaseRepository {
  suppliers(storeId: string): Promise<SupplierOption[]>;
  productsForPurchase(storeId: string): Promise<PurchaseProductInfo[]>;
  createSupplier(data: CreateSupplierData): Promise<{ supplierId: string } | 'TAX_ID_TAKEN'>;
  registerPurchase(data: RegisterPurchaseData): Promise<RegisterPurchaseResult>;
  generateReplenishmentOrders(data: {
    storeId: string;
    actorId: string;
    now: Date;
  }): Promise<{ createdCount: number; drafts: ReplenishmentDraft[] }>;
  discardPurchaseOrder(data: {
    storeId: string;
    actorId: string;
    orderId: string;
    now: Date;
  }): Promise<'OK' | 'NOT_FOUND'>;
}
