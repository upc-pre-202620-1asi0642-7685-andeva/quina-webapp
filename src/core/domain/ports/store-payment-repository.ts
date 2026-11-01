import type { PaymentDetails } from '../identity/payment-details';

/** Datos de cobro de la tienda (`stores`), con su auditoría (Plan 5, P3). */
export interface StorePaymentRepository {
  /** Guarda los datos y devuelve la ruta del QR anterior (para borrarlo si cambió). */
  save(input: {
    storeId: string;
    actorId: string;
    details: PaymentDetails;
    /** undefined = deja el QR como está; null = lo quita. */
    qrPath: string | null | undefined;
  }): Promise<{ previousQrPath: string | null }>;
}
