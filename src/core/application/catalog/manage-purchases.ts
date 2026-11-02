import { PlanLimits } from '@/core/domain/billing/plan-limits';
import {
  parsePurchase,
  type PurchaseError,
  type PurchaseInput,
} from '@/core/domain/catalog/purchase';
import {
  PurchaseAttachment,
  type PurchaseAttachmentError,
} from '@/core/domain/catalog/purchase-attachment';
import {
  parseSupplier,
  type SupplierError,
  type SupplierInput,
} from '@/core/domain/catalog/supplier';
import type { PrivateFileStorage } from '@/core/domain/ports/private-file-storage';
import type {
  AddReceiptsGuard,
  PurchaseRepository,
  StoredAttachment,
} from '@/core/domain/ports/purchase-repository';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type AttachmentUpload = {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
};

/**
 * US26 y US15: Casero (`receipts: false`, `receiptsPerMonth: 0`) no adjunta
 * comprobantes; Bodega Pro admite hasta 50 al mes; Negocio Plus es ilimitado.
 */
export function receiptsGuard(now: Date): AddReceiptsGuard {
  return (subscription, receiptsThisMonth, adding) => {
    if (adding <= 0) return true;
    const tier = PlanLimits.effectiveTier(subscription, now);
    const limit = PlanLimits.of(tier);
    if (!limit.features.receipts) return false;
    return limit.receiptsPerMonth === null || receiptsThisMonth + adding <= limit.receiptsPerMonth;
  };
}

export type CreateSupplierError = SupplierError | 'TAX_ID_TAKEN';

export class CreateSupplierUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(command: {
    storeId: string;
    actorId: string;
    input: SupplierInput;
    now: Date;
  }): Promise<Result<string, CreateSupplierError>> {
    const details = parseSupplier(command.input);
    if (!details.ok) return details;
    const created = await this.purchases.createSupplier({
      storeId: command.storeId,
      actorId: command.actorId,
      details: details.value,
      now: command.now,
    });
    if (created === 'TAX_ID_TAKEN') return err('TAX_ID_TAKEN');
    return ok(created.supplierId);
  }
}

export type RegisterPurchaseError =
  PurchaseError | PurchaseAttachmentError | 'SUPPLIER_NOT_FOUND' | 'RECEIPT_LIMIT_REACHED';

export class RegisterPurchaseUseCase {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly storage: PrivateFileStorage,
  ) {}

  async execute(command: {
    storeId: string;
    actorId: string;
    purchaseOrderId?: string | null | undefined;
    input: PurchaseInput;
    attachments: AttachmentUpload[];
    now: Date;
  }): Promise<Result<string, RegisterPurchaseError>> {
    const products = await this.purchases.productsForPurchase(command.storeId);
    const productsById = new Map(products.map((p) => [p.id, p]));
    const parsed = parsePurchase(command.input, productsById);
    if (!parsed.ok) return parsed;

    const validatedAttachments: PurchaseAttachment[] = [];
    for (const raw of command.attachments) {
      const checked = PurchaseAttachment.parse(raw);
      if (!checked.ok) return checked;
      validatedAttachments.push(checked.value);
    }

    // Subimos al bucket privado antes de abrir la transacción para no retener
    // candados FOR UPDATE en PostgreSQL durante llamadas de red a Storage.
    const uploaded: StoredAttachment[] = [];
    const removeUploaded = async () => {
      for (const item of uploaded) {
        await this.storage.remove(item.filePath);
      }
    };

    try {
      for (const item of validatedAttachments) {
        const filePath = `${command.storeId}/purchases/${crypto.randomUUID()}.${item.extension}`;
        await this.storage.upload({
          path: filePath,
          contentType: item.contentType,
          bytes: item.bytes,
        });
        uploaded.push({
          filePath,
          fileName: item.fileName,
          fileSize: item.fileSize,
          mimeType: item.contentType,
        });
      }

      const result = await this.purchases.registerPurchase({
        storeId: command.storeId,
        actorId: command.actorId,
        purchaseOrderId: command.purchaseOrderId?.trim() || null,
        purchase: parsed.value,
        attachments: uploaded,
        canAttach: receiptsGuard(command.now),
        now: command.now,
      });

      if (result.status !== 'OK') {
        await removeUploaded();
        return err(result.status);
      }

      return ok(result.purchaseId);
    } catch (error) {
      await removeUploaded();
      throw error;
    }
  }
}

export class GenerateReplenishmentOrdersUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(command: {
    storeId: string;
    actorId: string;
    now: Date;
  }): Promise<Result<{ createdCount: number }, 'NO_LOW_STOCK_PRODUCTS'>> {
    const outcome = await this.purchases.generateReplenishmentOrders(command);
    if (outcome.createdCount === 0) return err('NO_LOW_STOCK_PRODUCTS');
    return ok({ createdCount: outcome.createdCount });
  }
}
