import { and, asc, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { PurchaseDocumentType } from '@/core/domain/catalog/purchase';
import type { AttachmentMimeType } from '@/core/domain/catalog/purchase-attachment';
import { currentLimaMonthRange } from '../repositories/drizzle-purchase-repository';
import {
  products,
  purchaseAttachments,
  purchaseItems,
  purchaseOrderItems,
  purchaseOrders,
  purchases,
  suppliers,
  units,
  users,
} from '../schema';
import { withTenant } from '../with-tenant';

export type PurchaseListItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierTaxId: string;
  documentType: PurchaseDocumentType;
  series: string | null;
  documentNumber: string;
  issueDate: string;
  totalAmount: string;
  attachmentsCount: number;
  userName: string;
  createdAt: Date;
};

export type PurchaseDetailLine = {
  id: string;
  productId: string;
  productName: string;
  unitCode: string;
  quantity: string;
  unitCost: string;
  subtotal: string;
};

export type PurchaseAttachmentRow = {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: AttachmentMimeType;
  createdAt: Date;
};

export type PurchaseDetail = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierTaxId: string;
  documentType: PurchaseDocumentType;
  series: string | null;
  documentNumber: string;
  issueDate: string;
  totalAmount: string;
  notes: string | null;
  userName: string;
  createdAt: Date;
  lines: PurchaseDetailLine[];
  attachments: PurchaseAttachmentRow[];
};

export type DraftPurchaseOrderItem = {
  productId: string;
  productName: string;
  unitCode: string;
  allowDecimals: boolean;
  currentStock: string;
  minimumStock: string;
  currentAverageCost: string;
  quantity: string;
};

export type DraftPurchaseOrder = {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: DraftPurchaseOrderItem[];
};

export async function listPurchases(
  storeId: string,
  supplierId?: string,
): Promise<PurchaseListItem[]> {
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        id: purchases.id,
        supplierId: purchases.supplierId,
        supplierName: suppliers.tradeName,
        supplierTaxId: suppliers.taxIdNumber,
        documentType: purchases.documentType,
        series: purchases.series,
        documentNumber: purchases.documentNumber,
        issueDate: purchases.issueDate,
        totalAmount: purchases.totalAmount,
        userName: users.name,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .innerJoin(users, eq(users.id, purchases.userId))
      .where(
        and(
          eq(purchases.storeId, storeId),
          supplierId ? eq(purchases.supplierId, supplierId) : undefined,
        ),
      )
      .orderBy(desc(purchases.issueDate), desc(purchases.createdAt))
      .limit(100);

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const attCounts = await tx
      .select({
        purchaseId: purchaseAttachments.purchaseId,
        total: count(),
      })
      .from(purchaseAttachments)
      .where(inArray(purchaseAttachments.purchaseId, ids))
      .groupBy(purchaseAttachments.purchaseId);
    const countMap = new Map(attCounts.map((a) => [a.purchaseId, a.total]));

    return rows.map((r) => ({
      ...r,
      documentType: r.documentType as PurchaseDocumentType,
      attachmentsCount: countMap.get(r.id) ?? 0,
    }));
  });
}

export async function getPurchaseDetail(
  storeId: string,
  purchaseId: string,
): Promise<PurchaseDetail | null> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({
        id: purchases.id,
        supplierId: purchases.supplierId,
        supplierName: suppliers.tradeName,
        supplierTaxId: suppliers.taxIdNumber,
        documentType: purchases.documentType,
        series: purchases.series,
        documentNumber: purchases.documentNumber,
        issueDate: purchases.issueDate,
        totalAmount: purchases.totalAmount,
        notes: purchases.notes,
        userName: users.name,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .innerJoin(users, eq(users.id, purchases.userId))
      .where(and(eq(purchases.id, purchaseId), eq(purchases.storeId, storeId)));
    if (!row) return null;

    const [lines, attachments] = await Promise.all([
      tx
        .select({
          id: purchaseItems.id,
          productId: purchaseItems.productId,
          productName: products.name,
          unitCode: units.code,
          quantity: purchaseItems.quantity,
          unitCost: purchaseItems.unitCost,
          subtotal: purchaseItems.subtotal,
        })
        .from(purchaseItems)
        .innerJoin(products, eq(products.id, purchaseItems.productId))
        .innerJoin(units, eq(units.id, products.unitId))
        .where(eq(purchaseItems.purchaseId, purchaseId))
        .orderBy(asc(products.name)),
      tx
        .select({
          id: purchaseAttachments.id,
          filePath: purchaseAttachments.filePath,
          fileName: purchaseAttachments.fileName,
          fileSize: purchaseAttachments.fileSize,
          mimeType: purchaseAttachments.mimeType,
          createdAt: purchaseAttachments.createdAt,
        })
        .from(purchaseAttachments)
        .where(eq(purchaseAttachments.purchaseId, purchaseId))
        .orderBy(asc(purchaseAttachments.createdAt)),
    ]);

    return {
      ...row,
      documentType: row.documentType as PurchaseDocumentType,
      lines,
      attachments: attachments.map((a) => ({
        ...a,
        mimeType: a.mimeType as AttachmentMimeType,
      })),
    };
  });
}

export async function listDraftPurchaseOrders(storeId: string): Promise<DraftPurchaseOrder[]> {
  return withTenant(storeId, async (tx) => {
    const orders = await tx
      .select({
        id: purchaseOrders.id,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.tradeName,
        supplierTaxId: suppliers.taxIdNumber,
        createdAt: purchaseOrders.createdAt,
        updatedAt: purchaseOrders.updatedAt,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(and(eq(purchaseOrders.storeId, storeId), eq(purchaseOrders.status, 'DRAFT')))
      .orderBy(desc(purchaseOrders.updatedAt));

    if (orders.length === 0) return [];
    const orderIds = orders.map((o) => o.id);
    const items = await tx
      .select({
        purchaseOrderId: purchaseOrderItems.purchaseOrderId,
        productId: purchaseOrderItems.productId,
        productName: products.name,
        unitCode: units.code,
        allowDecimals: units.allowDecimals,
        currentStock: products.currentStock,
        minimumStock: products.minimumStock,
        currentAverageCost: products.currentAverageCost,
        quantity: purchaseOrderItems.quantity,
      })
      .from(purchaseOrderItems)
      .innerJoin(products, eq(products.id, purchaseOrderItems.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(inArray(purchaseOrderItems.purchaseOrderId, orderIds))
      .orderBy(asc(products.name));

    const byOrder = new Map<string, DraftPurchaseOrderItem[]>();
    for (const item of items) {
      const list = byOrder.get(item.purchaseOrderId) ?? [];
      list.push({
        productId: item.productId,
        productName: item.productName,
        unitCode: item.unitCode,
        allowDecimals: item.allowDecimals,
        currentStock: item.currentStock,
        minimumStock: item.minimumStock,
        currentAverageCost: item.currentAverageCost,
        quantity: item.quantity,
      });
      byOrder.set(item.purchaseOrderId, list);
    }

    return orders.map((o) => ({
      ...o,
      items: byOrder.get(o.id) ?? [],
    }));
  });
}

export async function getDraftPurchaseOrder(
  storeId: string,
  orderId: string,
): Promise<DraftPurchaseOrder | null> {
  const all = await listDraftPurchaseOrders(storeId);
  return all.find((o) => o.id === orderId) ?? null;
}

export async function countMonthlyPurchaseReceipts(
  storeId: string,
  now = new Date(),
): Promise<number> {
  return withTenant(storeId, async (tx) => {
    const { start, end } = currentLimaMonthRange(now);
    const [row] = await tx
      .select({ total: count() })
      .from(purchaseAttachments)
      .where(
        and(
          eq(purchaseAttachments.storeId, storeId),
          gte(purchaseAttachments.createdAt, start),
          lte(purchaseAttachments.createdAt, end),
        ),
      );
    return row?.total ?? 0;
  });
}
