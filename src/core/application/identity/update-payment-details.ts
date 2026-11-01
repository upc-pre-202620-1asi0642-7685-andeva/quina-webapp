import { ProductImage, type ProductImageError } from '@/core/domain/catalog/product-image';
import {
  PaymentDetails,
  type PaymentDetailsError,
  type PaymentDetailsField,
} from '@/core/domain/identity/payment-details';
import type { PrivateFileStorage } from '@/core/domain/ports/private-file-storage';
import type { StorePaymentRepository } from '@/core/domain/ports/store-payment-repository';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type UpdatePaymentDetailsError =
  PaymentDetailsError | { field: 'qr'; error: ProductImageError };

/** Plan 5, P3: el dueño carga Yape, Plin, la cuenta y el QR que verá el vecino en su portal. */
export class UpdatePaymentDetailsUseCase {
  constructor(
    private readonly repository: StorePaymentRepository,
    private readonly storage: PrivateFileStorage,
  ) {}

  async execute(input: {
    storeId: string;
    actorId: string;
    fields: Partial<Record<PaymentDetailsField, string>>;
    qr: { contentType: string; bytes: Uint8Array } | null;
    removeQr: boolean;
  }): Promise<Result<void, UpdatePaymentDetailsError>> {
    const details = PaymentDetails.parse(input.fields);
    if (!details.ok) return details;

    let qrPath: string | null | undefined = input.removeQr ? null : undefined;
    if (input.qr) {
      const image = ProductImage.parse(input.qr.contentType, input.qr.bytes);
      if (!image.ok) return err({ field: 'qr', error: image.error });
      // Nombre nuevo en cada carga: la URL firmada anterior no muestra el QR viejo
      qrPath = `stores/${input.storeId}/payment-qr-${crypto.randomUUID()}.${image.value.extension}`;
      await this.storage.upload({
        path: qrPath,
        contentType: image.value.contentType,
        bytes: image.value.bytes,
      });
    }

    try {
      const { previousQrPath } = await this.repository.save({
        storeId: input.storeId,
        actorId: input.actorId,
        details: details.value,
        qrPath,
      });
      if (qrPath !== undefined && previousQrPath && previousQrPath !== qrPath) {
        await this.storage.remove(previousQrPath);
      }
    } catch (error) {
      if (qrPath) await this.storage.remove(qrPath);
      throw error;
    }
    return ok(undefined);
  }
}
