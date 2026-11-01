import { describe, expect, it } from 'vitest';
import { UpdatePaymentDetailsUseCase } from '@/core/application/identity/update-payment-details';
import { PaymentDetails } from '@/core/domain/identity/payment-details';
import type { PrivateFileStorage } from '@/core/domain/ports/private-file-storage';
import type { StorePaymentRepository } from '@/core/domain/ports/store-payment-repository';

describe('PaymentDetails (Plan 5, P3)', () => {
  it('todo vacío es válido: la tienda puede no tener datos de cobro', () => {
    expect(PaymentDetails.parse({})).toEqual({
      ok: true,
      value: {
        yapeNumber: null,
        plinNumber: null,
        bankName: null,
        bankAccountNumber: null,
        bankCci: null,
      },
    });
  });

  it('normaliza los celulares, la cuenta y el CCI', () => {
    const result = PaymentDetails.parse({
      yapeNumber: '+51 987 654 321',
      plinNumber: '912345678',
      bankName: ' BCP ',
      bankAccountNumber: '191 1234567 0 12',
      bankCci: '002-191-001234567012-55',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        yapeNumber: '987654321',
        plinNumber: '912345678',
        bankName: 'BCP',
        bankAccountNumber: '1911234567012',
        bankCci: '00219100123456701255',
      },
    });
  });

  it('rechaza un Yape que no es celular, un CCI corto y una cuenta sin banco', () => {
    expect(PaymentDetails.parse({ yapeNumber: '12345' })).toEqual({
      ok: false,
      error: { field: 'yapeNumber', error: 'INVALID' },
    });
    expect(PaymentDetails.parse({ bankName: 'BCP', bankCci: '1234' })).toEqual({
      ok: false,
      error: { field: 'bankCci', error: 'INVALID' },
    });
    expect(PaymentDetails.parse({ bankAccountNumber: '1911234567012' })).toEqual({
      ok: false,
      error: { field: 'bankName', error: 'INVALID' },
    });
  });
});

function setup(previousQrPath: string | null = null) {
  const saved: Parameters<StorePaymentRepository['save']>[0][] = [];
  const uploaded: string[] = [];
  const removed: string[] = [];
  const repository: StorePaymentRepository = {
    save: async (input) => (saved.push(input), { previousQrPath }),
  };
  const storage: PrivateFileStorage = {
    upload: async ({ path }) => void uploaded.push(path),
    signedUrl: async () => null,
    remove: async (path) => void removed.push(path),
  };
  return {
    saved,
    uploaded,
    removed,
    useCase: new UpdatePaymentDetailsUseCase(repository, storage),
  };
}

const base = { storeId: 's-1', actorId: 'u-1', fields: { yapeNumber: '987654321' } };
const png = { contentType: 'image/png', bytes: new Uint8Array([1, 2, 3]) };

describe('UpdatePaymentDetailsUseCase', () => {
  it('sin QR nuevo deja el QR como está', async () => {
    const { saved, uploaded, useCase } = setup('stores/s-1/viejo.png');
    expect((await useCase.execute({ ...base, qr: null, removeQr: false })).ok).toBe(true);
    expect(saved[0]!.qrPath).toBeUndefined();
    expect(uploaded).toEqual([]);
  });

  it('un QR nuevo se sube con nombre propio y el anterior se borra', async () => {
    const { saved, uploaded, removed, useCase } = setup('stores/s-1/viejo.png');
    await useCase.execute({ ...base, qr: png, removeQr: false });
    expect(uploaded[0]).toMatch(/^stores\/s-1\/payment-qr-[0-9a-f-]+\.png$/);
    expect(saved[0]!.qrPath).toBe(uploaded[0]);
    expect(removed).toEqual(['stores/s-1/viejo.png']);
  });

  it('quitar el QR guarda null y borra el archivo', async () => {
    const { saved, removed, useCase } = setup('stores/s-1/viejo.png');
    await useCase.execute({ ...base, qr: null, removeQr: true });
    expect(saved[0]!.qrPath).toBeNull();
    expect(removed).toEqual(['stores/s-1/viejo.png']);
  });

  it('valida antes de subir nada', async () => {
    const { saved, uploaded, useCase } = setup();
    expect(
      await useCase.execute({
        ...base,
        qr: { contentType: 'application/pdf', bytes: new Uint8Array([1]) },
        removeQr: false,
      }),
    ).toEqual({ ok: false, error: { field: 'qr', error: 'IMAGE_TYPE' } });
    expect(
      (await useCase.execute({ ...base, fields: { plinNumber: 'abc' }, qr: png, removeQr: false }))
        .ok,
    ).toBe(false);
    expect(uploaded).toEqual([]);
    expect(saved).toEqual([]);
  });
});
