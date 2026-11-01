import { beforeEach, describe, expect, it } from 'vitest';
import {
  AdjustStockUseCase,
  CreateProductUseCase,
  SetProductActiveUseCase,
  UpdateProductUseCase,
  type CreateProductCommand,
} from '@/core/application/catalog/manage-catalog';
import { FakeImageStorage, InMemoryCatalog } from '../../fakes/in-memory-catalog';

const STORE = 'store-1';
const NOW = new Date('2026-11-02T15:00:00Z');

let catalog: InMemoryCatalog;
let images: FakeImageStorage;
let unitId: string;
let kgId: string;

function command(overrides: Partial<CreateProductCommand> = {}): CreateProductCommand {
  return {
    storeId: STORE,
    actorId: 'owner-1',
    details: {
      name: 'Arroz Costeño',
      description: '',
      brand: 'Costeño',
      sku: '',
      barcode: '',
      unitId,
      isService: false,
      allowsInstallments: false,
    },
    cashPrice: '4.50',
    creditPrice: '5.00',
    minimumStock: '5',
    initialStock: '20',
    image: null,
    now: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  catalog = new InMemoryCatalog();
  images = new FakeImageStorage();
  const [und, kg] = catalog.seedUnits(STORE);
  unitId = und!.id;
  kgId = kg!.id;
});

describe('CreateProductUseCase (US03)', () => {
  it('registra precios duales y deja el stock inicial en el kardex (D1)', async () => {
    const result = await new CreateProductUseCase(catalog, images).execute(command());
    expect(result.ok).toBe(true);
    const product = catalog.products.get(result.ok ? result.value : '')!;
    expect(product.prices).toEqual({ cash: '4.50', credit: '5.00' });
    expect(product.stock).toBe('20.000');
    expect(catalog.movements).toEqual([
      { productId: result.ok && result.value, quantity: '20.000', notes: 'Stock inicial' },
    ]);
  });

  it('rechaza crédito menor que contado (crit. 6)', async () => {
    const result = await new CreateProductUseCase(catalog, images).execute(
      command({ cashPrice: '5', creditPrice: '4' }),
    );
    expect(result).toEqual({ ok: false, error: 'CREDIT_BELOW_CASH' });
  });

  it('un servicio nace sin stock aunque se escriba uno (crit. 2)', async () => {
    const result = await new CreateProductUseCase(catalog, images).execute(
      command({ details: { ...command().details, isService: true } }),
    );
    const product = catalog.products.get(result.ok ? result.value : '')!;
    expect(product.stock).toBe('0.000');
    expect(product.minimumStock).toBe('0.000');
    expect(catalog.movements).toHaveLength(0);
  });

  it('exige stock entero en unidades y admite decimales en kilos', async () => {
    const useCase = new CreateProductUseCase(catalog, images);
    expect(await useCase.execute(command({ initialStock: '2.5' }))).toEqual({
      ok: false,
      error: 'INITIAL_STOCK_QUANTITY_NOT_WHOLE',
    });
    const kilos = await useCase.execute(
      command({ initialStock: '2.5', details: { ...command().details, unitId: kgId } }),
    );
    expect(kilos.ok).toBe(true);
  });

  it('rechaza una unidad de otra tienda', async () => {
    const result = await new CreateProductUseCase(catalog, images).execute(
      command({ details: { ...command().details, unitId: 'otra-UND' } }),
    );
    expect(result).toEqual({ ok: false, error: 'UNIT_NOT_FOUND' });
  });

  it('sube la imagen y guarda su URL (crit. 3)', async () => {
    const result = await new CreateProductUseCase(catalog, images).execute(
      command({ image: { contentType: 'image/png', bytes: new Uint8Array([1, 2, 3]) } }),
    );
    const product = catalog.products.get(result.ok ? result.value : '')!;
    expect(product.imageUrl).toMatch(/^https:\/\/img\.test\/store-1\/.+\.png$/);
    expect(images.files.size).toBe(1);
  });

  it('no sube nada si la imagen no es válida', async () => {
    const result = await new CreateProductUseCase(catalog, images).execute(
      command({ image: { contentType: 'application/pdf', bytes: new Uint8Array([1]) } }),
    );
    expect(result).toEqual({ ok: false, error: 'IMAGE_TYPE' });
    expect(images.files.size).toBe(0);
  });

  it('bloquea el producto 51 de Casero y borra la imagen ya subida (US26 crit. 2)', async () => {
    const useCase = new CreateProductUseCase(catalog, images);
    for (let i = 0; i < 50; i++) await useCase.execute(command({ initialStock: '' }));
    const result = await useCase.execute(
      command({ image: { contentType: 'image/jpeg', bytes: new Uint8Array([9]) } }),
    );
    expect(result).toEqual({ ok: false, error: 'PLAN_LIMIT_REACHED' });
    expect(images.files.size).toBe(0);
    expect(images.removed).toHaveLength(1);
  });

  it('en la prueba Pro no hay límite de productos', async () => {
    catalog.subscriptions.set(STORE, {
      planTier: 'BODEGA_PRO',
      status: 'TRIALING',
      trialEndsAt: new Date('2026-11-10T00:00:00Z'),
    });
    const useCase = new CreateProductUseCase(catalog, images);
    for (let i = 0; i < 50; i++) await useCase.execute(command({ initialStock: '' }));
    expect((await useCase.execute(command())).ok).toBe(true);
  });

  it('rechaza un código de barras repetido en la tienda', async () => {
    const useCase = new CreateProductUseCase(catalog, images);
    const withBarcode = command({ details: { ...command().details, barcode: '7750000000001' } });
    await useCase.execute(withBarcode);
    expect(await useCase.execute(withBarcode)).toEqual({ ok: false, error: 'BARCODE_TAKEN' });
  });
});

describe('UpdateProductUseCase (US03 crit. 4)', () => {
  async function created(): Promise<string> {
    const result = await new CreateProductUseCase(catalog, images).execute(
      command({ image: { contentType: 'image/png', bytes: new Uint8Array([1]) } }),
    );
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  const update = (productId: string, overrides: Record<string, unknown> = {}) =>
    new UpdateProductUseCase(catalog, images).execute({
      ...command(),
      productId,
      priceReason: '',
      image: null,
      removeImage: false,
      ...overrides,
    });

  it('guarda el precio anterior y el nuevo en el historial', async () => {
    const id = await created();
    expect((await update(id, { creditPrice: '5.50' })).ok).toBe(true);
    expect(catalog.priceHistory).toEqual([
      {
        productId: id,
        before: { cash: '4.50', credit: '5.00' },
        after: { cash: '4.50', credit: '5.50' },
      },
    ]);
  });

  it('sin cambio de precio no escribe historial', async () => {
    const id = await created();
    await update(id, { details: { ...command().details, name: 'Arroz extra' } });
    expect(catalog.priceHistory).toHaveLength(0);
  });

  it('reemplazar la imagen borra la anterior', async () => {
    const id = await created();
    const before = catalog.products.get(id)!.imageUrl;
    await update(id, { image: { contentType: 'image/webp', bytes: new Uint8Array([2]) } });
    expect(images.removed).toEqual([before]);
    expect(catalog.products.get(id)!.imageUrl).not.toBe(before);
  });

  it('quitar la imagen deja la ficha sin imagen', async () => {
    const id = await created();
    await update(id, { removeImage: true });
    expect(catalog.products.get(id)!.imageUrl).toBeNull();
    expect(images.files.size).toBe(0);
  });

  it('no convierte en servicio un producto con stock', async () => {
    const id = await created();
    const result = await update(id, { details: { ...command().details, isService: true } });
    expect(result).toEqual({ ok: false, error: 'SERVICE_HAS_STOCK' });
  });

  it('un producto de otra tienda no existe', async () => {
    const id = await created();
    expect(await update(id, { storeId: 'store-2' })).toEqual({
      ok: false,
      error: 'UNIT_NOT_FOUND',
    });
  });
});

describe('baja y ajuste de stock', () => {
  it('dar de baja libera el cupo; reactivar con el cupo lleno se bloquea (D10)', async () => {
    const create = new CreateProductUseCase(catalog, images);
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const result = await create.execute(command({ initialStock: '' }));
      if (result.ok) ids.push(result.value);
    }
    const toggle = new SetProductActiveUseCase(catalog);
    const base = { storeId: STORE, actorId: 'owner-1', now: NOW };
    await toggle.execute({ ...base, productId: ids[0]!, active: false });
    expect((await create.execute(command())).ok).toBe(true);
    expect(await toggle.execute({ ...base, productId: ids[0]!, active: true })).toEqual({
      ok: false,
      error: 'PLAN_LIMIT_REACHED',
    });
  });

  it('el conteo físico registra la diferencia con motivo (D1)', async () => {
    const result = await new CreateProductUseCase(catalog, images).execute(command());
    const productId = result.ok ? result.value : '';
    const adjust = new AdjustStockUseCase(catalog);
    const base = { storeId: STORE, actorId: 'owner-1', productId, allowDecimals: false, now: NOW };
    expect(await adjust.execute({ ...base, countedStock: '18', reason: ' ' })).toEqual({
      ok: false,
      error: 'REASON_REQUIRED',
    });
    expect((await adjust.execute({ ...base, countedStock: '18', reason: 'Conteo' })).ok).toBe(true);
    expect(catalog.movements.at(-1)).toEqual({ productId, quantity: '-2.000', notes: 'Conteo' });
    expect(await adjust.execute({ ...base, countedStock: '18', reason: 'Otra vez' })).toEqual({
      ok: false,
      error: 'NO_CHANGE',
    });
  });
});
