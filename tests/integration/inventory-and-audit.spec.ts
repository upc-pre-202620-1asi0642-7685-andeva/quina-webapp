import { randomInt, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CreateProductUseCase,
  RecordWasteUseCase,
} from '@/core/application/catalog/manage-catalog';
import {
  CreateSupplierUseCase,
  GenerateReplenishmentOrdersUseCase,
  RegisterPurchaseUseCase,
} from '@/core/application/catalog/manage-purchases';
import { RegisterCashSaleUseCase } from '@/core/application/sales/register-cash-sale';
import { closeDb, db } from '@/infrastructure/db/connection';
import { listAuditLogs } from '@/infrastructure/db/queries/audit';
import {
  countLowStockProducts,
  getProduct,
  listProducts,
} from '@/infrastructure/db/queries/catalog';
import {
  getPurchaseDetail,
  listDraftPurchaseOrders,
  listPurchases,
} from '@/infrastructure/db/queries/purchases';
import { DrizzleProductRepository } from '@/infrastructure/db/repositories/drizzle-product-repository';
import { DrizzlePurchaseRepository } from '@/infrastructure/db/repositories/drizzle-purchase-repository';
import { DrizzleSaleRepository } from '@/infrastructure/db/repositories/drizzle-sale-repository';
import { BASE_UNITS } from '@/infrastructure/db/repositories/drizzle-store-registration-repository';
import {
  auditLogs,
  inventoryMovements,
  purchaseOrders,
  stores,
  storeSubscriptions,
  units,
  users,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import type { PrivateFileStorage } from '@/core/domain/ports/private-file-storage';
import { LocalPrivateFileStorage } from '@/infrastructure/storage/private-file-storage';
import { FakeImageStorage } from '../fakes/in-memory-catalog';

afterAll(async () => {
  await closeDb();
});

const productRepo = new DrizzleProductRepository();
const purchaseRepo = new DrizzlePurchaseRepository();
const saleRepo = new DrizzleSaleRepository();
const privateStorage: PrivateFileStorage = new LocalPrivateFileStorage();

async function createStore(planTier: 'CASERO' | 'BODEGA_PRO' = 'BODEGA_PRO') {
  const suffix = randomUUID().replaceAll('-', '');
  const [store] = await db
    .insert(stores)
    .values({
      commercialName: `Bodega ${suffix.slice(0, 6)}`,
      businessTurn: 'BODEGA',
      taxIdType: 'RUC',
      taxIdNumber: `20${String(randomInt(1e9)).padStart(9, '0')}`,
      ownerFullName: 'Rosa Quispe',
      contactEmail: `${suffix}@store.test`,
    })
    .returning({ id: stores.id });
  const storeId = store!.id;
  await withTenant(storeId, async (tx) => {
    await tx.insert(storeSubscriptions).values({
      storeId,
      planTier,
      status: 'ACTIVE',
      ...(planTier === 'CASERO'
        ? {}
        : { billingInterval: 'MONTHLY', currentPeriodEnd: new Date('2099-01-01T00:00:00Z') }),
    });
    await tx.insert(units).values(BASE_UNITS.map((unit) => ({ ...unit, storeId })));
  });
  const [owner] = await db
    .insert(users)
    .values({
      name: 'Rosa Quispe',
      email: `owner-${suffix}@store.test`,
      emailVerified: true,
      role: 'STORE_OWNER',
      storeId,
    })
    .returning({ id: users.id });
  const unitList = await productRepo.units(storeId);
  return {
    storeId,
    ownerId: owner!.id,
    und: unitList.find((u) => u.code === 'UND')!.id,
  };
}

describe('Inventario, Compras, Costo Promedio, Reposición y Auditoría (US15–US18)', () => {
  it('calcula costo promedio en compras, lo conserva en ventas y mermas, y protege inmutabilidad', async () => {
    const ctx = await createStore('BODEGA_PRO');
    const t0 = new Date('2026-11-15T15:00:00Z');
    let tick = 0;
    const nextNow = () => new Date(t0.getTime() + ++tick * 1000);

    // 1. Crear proveedor
    const supRes = await new CreateSupplierUseCase(purchaseRepo).execute({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      input: {
        taxIdNumber: `20${String(randomInt(1e9)).padStart(9, '0')}`,
        tradeName: 'Distribuidora Norte SAC',
        phone: '999888777',
      },
      now: nextNow(),
    });
    expect(supRes.ok).toBe(true);
    const supplierId = supRes.ok ? supRes.value : '';

    // 2. Crear producto con stock 0 y mínimo 15, asignado al proveedor
    const prodRes = await new CreateProductUseCase(productRepo, new FakeImageStorage()).execute({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      details: {
        name: 'Aceite Primor 1 L',
        description: '',
        brand: 'Primor',
        sku: '',
        barcode: '',
        unitId: ctx.und,
        defaultSupplierId: supplierId,
        isService: false,
        allowsInstallments: false,
      },
      cashPrice: '9.00',
      creditPrice: '9.50',
      minimumStock: '15',
      initialStock: '0',
      image: null,
      now: nextNow(),
    });
    expect(prodRes.ok).toBe(true);
    const productId = prodRes.ok ? prodRes.value : '';

    // 3. Está en stock crítico (0 <= 15): generar pedido borrador (US17)
    expect(await countLowStockProducts(ctx.storeId)).toBe(1);
    const lowList = await listProducts(ctx.storeId, '', { lowStockOnly: true });
    expect(lowList.map((p) => p.id)).toEqual([productId]);

    const draftRes = await new GenerateReplenishmentOrdersUseCase(purchaseRepo).execute({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      now: nextNow(),
    });
    expect(draftRes).toEqual({ ok: true, value: { createdCount: 1 } });
    const drafts = await listDraftPurchaseOrders(ctx.storeId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.supplierId).toBe(supplierId);
    expect(drafts[0]!.items[0]!.quantity).toBe('15.000');

    // 4. Primera compra: 10 unidades a S/ 6.00 con comprobante PDF y cerrando el pedido borrador
    const registerPurchase = new RegisterPurchaseUseCase(purchaseRepo, privateStorage);
    const pur1 = await registerPurchase.execute({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      purchaseOrderId: drafts[0]!.id,
      input: {
        supplierId,
        documentType: 'FACTURA',
        series: 'F001',
        documentNumber: '000101',
        issueDate: '2026-11-15',
        lines: [{ productId, quantity: '10', unitCost: '6.00' }],
      },
      attachments: [
        {
          fileName: 'factura-101.pdf',
          contentType: 'application/pdf',
          bytes: new Uint8Array([37, 80, 68, 70]),
        },
      ],
      now: nextNow(),
    });
    expect(pur1.ok).toBe(true);

    // El pedido borrador pasó a RECEIVED
    expect(await listDraftPurchaseOrders(ctx.storeId)).toHaveLength(0);
    const [orderRow] = await withTenant(ctx.storeId, (tx) =>
      tx
        .select({ status: purchaseOrders.status })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, drafts[0]!.id)),
    );
    expect(orderRow?.status).toBe('RECEIVED');

    // 5. Segunda compra: 20 unidades a S/ 6.60 -> Costo promedio: (10*6.00 + 20*6.60)/30 = 6.4000
    const pur2 = await registerPurchase.execute({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      input: {
        supplierId,
        documentType: 'BOLETA',
        series: 'B001',
        documentNumber: '000202',
        issueDate: '2026-11-15',
        lines: [{ productId, quantity: '20', unitCost: '6.60' }],
      },
      attachments: [],
      now: nextNow(),
    });
    expect(pur2.ok).toBe(true);

    let detail = await getProduct(ctx.storeId, productId);
    expect(detail?.currentStock).toBe('30.000');
    expect(detail?.currentAverageCost).toBe('6.4000');

    // 6. Venta al contado de 5 unidades: descuenta stock a 25 y NO cambia costo promedio (6.4000)
    const cashSale = await new RegisterCashSaleUseCase(saleRepo).execute({
      storeId: ctx.storeId,
      cashierId: ctx.ownerId,
      customerId: null,
      cart: [{ productId, quantity: '5' }],
      paymentMethod: 'YAPE',
      amountReceived: '',
      now: nextNow(),
    });
    expect(cashSale.ok).toBe(true);

    // 7. Merma de 2 unidades: descuenta stock a 23 y NO cambia costo promedio (6.4000)
    const wasteRes = await new RecordWasteUseCase(productRepo).execute({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      productId,
      allowDecimals: false,
      quantity: '2',
      reason: 'Botellas rotas en transporte',
      now: nextNow(),
    });
    expect(wasteRes.ok).toBe(true);

    detail = await getProduct(ctx.storeId, productId);
    expect(detail?.currentStock).toBe('23.000');
    expect(detail?.currentAverageCost).toBe('6.4000');
    expect(detail?.movements.map((m) => m.movementType)).toEqual([
      'WASTE_LOSS',
      'SALE_EXIT',
      'PURCHASE_ENTRY',
      'PURCHASE_ENTRY',
    ]);

    // 8. Consulta de compra y URL firmada del comprobante (US15 crit. 5)
    const purchasesList = await listPurchases(ctx.storeId, supplierId);
    expect(purchasesList).toHaveLength(2);
    const pur1Detail = await getPurchaseDetail(ctx.storeId, pur1.ok ? pur1.value : '');
    expect(pur1Detail?.attachments).toHaveLength(1);
    const signed = await privateStorage.signedUrl(pur1Detail!.attachments[0]!.filePath, 900);
    expect(signed).toContain('data:application/pdf;base64,');

    // 9. Inmutabilidad de inventory_movements y audit_logs (US16 crit. 4, US18 crit. 2)
    await expect(
      withTenant(ctx.storeId, (tx) =>
        tx
          .update(inventoryMovements)
          .set({ notes: 'Alterado' })
          .where(eq(inventoryMovements.productId, productId)),
      ),
    ).rejects.toThrow();

    await expect(
      withTenant(ctx.storeId, (tx) =>
        tx.delete(auditLogs).where(eq(auditLogs.storeId, ctx.storeId)),
      ),
    ).rejects.toThrow();

    // 10. Historial de auditoría y aislamiento RLS entre tiendas (US18 crit. 1 y 5)
    const otherStore = await createStore('CASERO');
    expect(await listAuditLogs(otherStore.storeId)).toHaveLength(0);

    const storeLogs = await listAuditLogs(ctx.storeId);
    const actions = storeLogs.map((l) => l.action);
    expect(actions).toContain('CREATE_SUPPLIER');
    expect(actions).toContain('CREATE_PRODUCT');
    expect(actions).toContain('GENERATE_REPLENISHMENT_ORDERS');
    expect(actions).toContain('REGISTER_PURCHASE');
    expect(actions).toContain('CREATE_CASH_SALE');
    expect(actions).toContain('RECORD_WASTE');

    const onlyWaste = await listAuditLogs(ctx.storeId, { entityName: 'products' });
    expect(onlyWaste.every((l) => l.entityName === 'products')).toBe(true);

    // 11. Plan CASERO rechaza comprobantes adjuntos (RECEIPT_LIMIT_REACHED) pero permite compras sin adjunto (US26)
    const caseroSup = await new CreateSupplierUseCase(purchaseRepo).execute({
      storeId: otherStore.storeId,
      actorId: otherStore.ownerId,
      input: {
        taxIdNumber: `20${String(randomInt(1e9)).padStart(9, '0')}`,
        tradeName: 'Proveedor Casero SAC',
        phone: '',
      },
      now: nextNow(),
    });
    const caseroProd = await new CreateProductUseCase(productRepo, new FakeImageStorage()).execute({
      storeId: otherStore.storeId,
      actorId: otherStore.ownerId,
      details: {
        name: 'Arroz Costeño 1 kg',
        description: '',
        brand: '',
        sku: '',
        barcode: '',
        unitId: otherStore.und,
        defaultSupplierId: null,
        isService: false,
        allowsInstallments: false,
      },
      cashPrice: '4.50',
      creditPrice: '4.50',
      minimumStock: '5',
      initialStock: '0',
      image: null,
      now: nextNow(),
    });
    const caseroRejected = await registerPurchase.execute({
      storeId: otherStore.storeId,
      actorId: otherStore.ownerId,
      input: {
        supplierId: caseroSup.ok ? caseroSup.value : '',
        documentType: 'BOLETA',
        series: 'B001',
        documentNumber: '000001',
        issueDate: '2026-11-15',
        lines: [
          { productId: caseroProd.ok ? caseroProd.value : '', quantity: '5', unitCost: '3.20' },
        ],
      },
      attachments: [
        {
          fileName: 'boleta.pdf',
          contentType: 'application/pdf',
          bytes: new Uint8Array([37, 80, 68, 70]),
        },
      ],
      now: nextNow(),
    });
    expect(caseroRejected).toEqual({ ok: false, error: 'RECEIPT_LIMIT_REACHED' });
  });
});
