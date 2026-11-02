import { describe, expect, it } from 'vitest';
import { RecordWasteUseCase } from '@/core/application/catalog/manage-catalog';
import {
  CreateSupplierUseCase,
  GenerateReplenishmentOrdersUseCase,
  RegisterPurchaseUseCase,
} from '@/core/application/catalog/manage-purchases';
import { parsePurchase, type PurchaseProductInfo } from '@/core/domain/catalog/purchase';
import { PurchaseAttachment } from '@/core/domain/catalog/purchase-attachment';
import { Quantity } from '@/core/domain/catalog/quantity';
import {
  buildReplenishmentDrafts,
  isCriticalStock,
  suggestedReplenishmentQuantity,
  type ReplenishableProduct,
  type ReplenishmentDraft,
} from '@/core/domain/catalog/replenishment';
import { parseSupplier } from '@/core/domain/catalog/supplier';
import { UnitCost } from '@/core/domain/catalog/unit-cost';
import type { PrivateFileStorage } from '@/core/domain/ports/private-file-storage';
import type {
  CreateSupplierData,
  PurchaseRepository,
  RegisterPurchaseData,
  RegisterPurchaseResult,
  SupplierOption,
} from '@/core/domain/ports/purchase-repository';
import { InMemoryCatalog } from '../../fakes/in-memory-catalog';

class FakePurchaseRepo implements PurchaseRepository {
  suppliersList: SupplierOption[] = [];
  productsMap = new Map<
    string,
    PurchaseProductInfo & { currentStock: string; currentAverageCost: string }
  >();
  lowStock: ReplenishableProduct[] = [];
  draftOrders: ReplenishmentDraft[] = [];
  tier: 'CASERO' | 'BODEGA_PRO' | 'NEGOCIO_PLUS' = 'BODEGA_PRO';
  receiptsUsedThisMonth = 0;

  async suppliers(): Promise<SupplierOption[]> {
    return this.suppliersList;
  }

  async productsForPurchase(): Promise<PurchaseProductInfo[]> {
    return [...this.productsMap.values()];
  }

  async createSupplier(data: CreateSupplierData): Promise<{ supplierId: string } | 'TAX_ID_TAKEN'> {
    if (this.suppliersList.some((s) => s.taxIdNumber === data.details.taxIdNumber)) {
      return 'TAX_ID_TAKEN';
    }
    const id = `sup-${this.suppliersList.length + 1}`;
    this.suppliersList.push({
      id,
      taxIdNumber: data.details.taxIdNumber,
      tradeName: data.details.tradeName,
      contactName: data.details.contactName,
      phone: data.details.phone,
      email: data.details.email,
      isActive: true,
    });
    return { supplierId: id };
  }

  async registerPurchase(data: RegisterPurchaseData): Promise<RegisterPurchaseResult> {
    if (!this.suppliersList.some((s) => s.id === data.purchase.supplierId)) {
      return { status: 'SUPPLIER_NOT_FOUND' };
    }
    if (data.attachments.length > 0) {
      const sub = { planTier: this.tier, status: 'ACTIVE' as const, trialEndsAt: null };
      if (!data.canAttach(sub, this.receiptsUsedThisMonth, data.attachments.length)) {
        return { status: 'RECEIPT_LIMIT_REACHED' };
      }
    }
    for (const line of data.purchase.lines) {
      const current = this.productsMap.get(line.productId);
      if (!current) return { status: 'PRODUCT_NOT_FOUND' };
      if (current.isService) return { status: 'PRODUCT_IS_SERVICE' };
      const averageCostAfter = UnitCost.weightedAverage(
        current.currentStock,
        current.currentAverageCost,
        line.quantity,
        line.unitCost,
      );
      const stockAfter = Quantity.plus(current.currentStock, line.quantity);
      this.productsMap.set(line.productId, {
        ...current,
        currentStock: stockAfter,
        currentAverageCost: averageCostAfter,
      });
    }
    this.receiptsUsedThisMonth += data.attachments.length;
    return { status: 'OK', purchaseId: 'pur-1' };
  }

  async generateReplenishmentOrders(): Promise<{
    createdCount: number;
    drafts: ReplenishmentDraft[];
  }> {
    this.draftOrders = buildReplenishmentDrafts(this.lowStock);
    return { createdCount: this.draftOrders.length, drafts: this.draftOrders };
  }

  async discardPurchaseOrder(): Promise<'OK' | 'NOT_FOUND'> {
    return 'OK';
  }
}

class FakePrivateStorage implements PrivateFileStorage {
  uploaded: string[] = [];
  removed: string[] = [];
  async upload(input: { path: string }): Promise<void> {
    this.uploaded.push(input.path);
  }
  async signedUrl(path: string): Promise<string> {
    return `https://signed.test/${path}`;
  }
  async remove(path: string): Promise<void> {
    this.removed.push(path);
  }
}

describe('UnitCost y Costo Promedio Ponderado (US16)', () => {
  it('calcula el costo promedio ponderado con 4 decimales y ROUND_HALF_UP (crit. 1 y 4)', () => {
    expect(UnitCost.weightedAverage('0.000', '0.0000', '10.000', '3.2000')).toBe('3.2000');
    expect(UnitCost.weightedAverage('10.000', '3.2000', '20.000', '3.5000')).toBe('3.4000');
    expect(UnitCost.weightedAverage('1.000', '1.0000', '2.000', '2.0000')).toBe('1.6667');
  });

  it('valoriza el inventario activo excluyendo servicios y dados de baja (crit. 5)', () => {
    const total = UnitCost.inventoryValuation([
      { isService: false, isActive: true, currentStock: '10.000', currentAverageCost: '3.4000' },
      { isService: false, isActive: true, currentStock: '5.000', currentAverageCost: '2.0000' },
      { isService: true, isActive: true, currentStock: '100.000', currentAverageCost: '9.0000' },
      { isService: false, isActive: false, currentStock: '10.000', currentAverageCost: '5.0000' },
    ]);
    expect(total.toFixed2()).toBe('44.00');
  });
});

describe('Proveedores, Compras y Comprobantes de hasta 5 MB (US15)', () => {
  it('valida proveedor con RUC o DNI y rechaza nombre vacío', () => {
    expect(
      parseSupplier({
        taxIdNumber: '20123456789',
        tradeName: 'Distribuidora Sur SAC',
      }).ok,
    ).toBe(true);
    expect(parseSupplier({ taxIdNumber: '123', tradeName: 'X' })).toEqual({
      ok: false,
      error: 'TAX_ID_INVALID',
    });
  });

  it('acepta JPG, PNG, WEBP y PDF hasta 5 MB y rechaza excesos (crit. 4)', () => {
    const pdfBytes = new Uint8Array(1024);
    const parsed = PurchaseAttachment.parse({
      fileName: 'factura:F001/123.pdf',
      contentType: 'application/pdf',
      bytes: pdfBytes,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.contentType).toBe('application/pdf');
      expect(parsed.value.extension).toBe('pdf');
      expect(parsed.value.fileName).toBe('factura-F001-123.pdf');
    }

    expect(
      PurchaseAttachment.parse({
        fileName: 'pesado.pdf',
        contentType: 'application/pdf',
        bytes: new Uint8Array(5 * 1024 * 1024 + 1),
      }),
    ).toEqual({ ok: false, error: 'ATTACHMENT_TOO_LARGE' });
  });

  it('valida el documento de compra y líneas sin duplicados', () => {
    const productsById = new Map<string, PurchaseProductInfo>([
      ['p-1', { id: 'p-1', isService: false, allowDecimals: false }],
    ]);
    const parsed = parsePurchase(
      {
        supplierId: 'sup-1',
        documentType: 'FACTURA',
        series: 'f001',
        documentNumber: '00045',
        issueDate: '2026-11-01',
        lines: [{ productId: 'p-1', quantity: '10', unitCost: '3.20' }],
      },
      productsById,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.series).toBe('F001');
      expect(parsed.value.totalAmount).toBe('32.00');
    }
  });

  it('registra una compra actualizando stock y costo promedio y bloquea comprobantes en Casero (US15 crit. 1, 2, 6)', async () => {
    const repo = new FakePurchaseRepo();
    const storage = new FakePrivateStorage();
    const createSup = new CreateSupplierUseCase(repo);
    const supRes = await createSup.execute({
      storeId: 'store-1',
      actorId: 'owner-1',
      input: { taxIdNumber: '20123456789', tradeName: 'Alicorp' },
      now: new Date('2026-11-01T15:00:00Z'),
    });
    expect(supRes.ok).toBe(true);
    const supplierId = supRes.ok ? supRes.value : '';

    repo.productsMap.set('p-1', {
      id: 'p-1',
      isService: false,
      allowDecimals: false,
      currentStock: '10.000',
      currentAverageCost: '3.2000',
    });

    const register = new RegisterPurchaseUseCase(repo, storage);
    const res = await register.execute({
      storeId: 'store-1',
      actorId: 'owner-1',
      input: {
        supplierId,
        documentType: 'FACTURA',
        series: 'F001',
        documentNumber: '100',
        issueDate: '2026-11-01',
        lines: [{ productId: 'p-1', quantity: '20', unitCost: '3.50' }],
      },
      attachments: [
        {
          fileName: 'factura.pdf',
          contentType: 'application/pdf',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      now: new Date('2026-11-01T15:00:00Z'),
    });
    expect(res.ok).toBe(true);
    expect(repo.productsMap.get('p-1')).toMatchObject({
      currentStock: '30.000',
      currentAverageCost: '3.4000',
    });
    expect(storage.uploaded).toHaveLength(1);

    // En Casero bloquea adjuntar comprobantes y limpia el archivo subido
    repo.tier = 'CASERO';
    const blocked = await register.execute({
      storeId: 'store-1',
      actorId: 'owner-1',
      input: {
        supplierId,
        documentType: 'BOLETA',
        documentNumber: '101',
        issueDate: '2026-11-01',
        lines: [{ productId: 'p-1', quantity: '5', unitCost: '3.50' }],
      },
      attachments: [
        {
          fileName: 'boleta.jpg',
          contentType: 'image/jpeg',
          bytes: new Uint8Array([9, 9]),
        },
      ],
      now: new Date('2026-11-01T15:00:00Z'),
    });
    expect(blocked).toEqual({ ok: false, error: 'RECEIPT_LIMIT_REACHED' });
    expect(storage.removed).toHaveLength(1);
  });
});

describe('Mermas (US16 crit. 3) y Reposición por proveedor (US17)', () => {
  it('registra merma descontando stock y rechazando excesos sobre el stock actual', async () => {
    const catalog = new InMemoryCatalog();
    const [und] = catalog.seedUnits('store-1');
    await catalog.create({
      storeId: 'store-1',
      actorId: 'owner-1',
      details: {
        name: 'Leche Gloria',
        description: null,
        brand: 'Gloria',
        sku: null,
        barcode: null,
        unitId: und!.id,
        isService: false,
        allowsInstallments: false,
      },
      prices: { cash: '4.20', credit: '4.50' },
      minimumStock: '5.000',
      initialStock: '10.000',
      image: null,
      now: new Date(),
      canAdd: () => true,
    });

    const waste = new RecordWasteUseCase(catalog);
    expect(
      await waste.execute({
        storeId: 'store-1',
        actorId: 'owner-1',
        productId: 'p-1',
        allowDecimals: false,
        quantity: '15',
        reason: 'Se venció',
        now: new Date(),
      }),
    ).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK' });

    const okWaste = await waste.execute({
      storeId: 'store-1',
      actorId: 'owner-1',
      productId: 'p-1',
      allowDecimals: false,
      quantity: '2',
      reason: 'Lata abollada',
      now: new Date(),
    });
    expect(okWaste.ok).toBe(true);
    expect(catalog.products.get('p-1')!.stock).toBe('8.000');
  });

  it('detecta stock crítico y agrupa borradores de pedido por proveedor habitual (US17 crit. 2 y 5)', async () => {
    expect(
      isCriticalStock({
        isActive: true,
        isService: false,
        currentStock: '5.000',
        minimumStock: '5.000',
      }),
    ).toBe(true);
    expect(
      suggestedReplenishmentQuantity({
        currentStock: '2.000',
        minimumStock: '10.000',
      }),
    ).toBe('8.000');

    const repo = new FakePurchaseRepo();
    repo.lowStock = [
      {
        id: 'p-1',
        isService: false,
        isActive: true,
        defaultSupplierId: 'sup-1',
        currentStock: '2.000',
        minimumStock: '10.000',
      },
      {
        id: 'p-2',
        isService: false,
        isActive: true,
        defaultSupplierId: null,
        currentStock: '5.000',
        minimumStock: '5.000',
      },
    ];
    const gen = new GenerateReplenishmentOrdersUseCase(repo);
    const res = await gen.execute({ storeId: 'store-1', actorId: 'owner-1', now: new Date() });
    expect(res).toEqual({ ok: true, value: { createdCount: 2 } });
    expect(repo.draftOrders).toEqual([
      {
        supplierId: 'sup-1',
        items: [{ productId: 'p-1', quantity: '8.000' }],
      },
      {
        supplierId: null,
        items: [{ productId: 'p-2', quantity: '1.000' }],
      },
    ]);
  });
});
