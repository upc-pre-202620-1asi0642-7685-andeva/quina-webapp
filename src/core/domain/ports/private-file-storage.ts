import type { AttachmentMimeType } from '../catalog/purchase-attachment';

/** Archivos privados de la tienda (QR de cobro Plan 5 P3 y comprobantes de compra US15): solo se ven con una URL firmada. */
export interface PrivateFileStorage {
  upload(input: {
    path: string;
    contentType: AttachmentMimeType;
    bytes: Uint8Array;
  }): Promise<void>;
  /** URL temporal para mostrar el archivo; null si no existe. */
  signedUrl(path: string, expiresInSeconds: number): Promise<string | null>;
  /** Borra un archivo reemplazado; nunca lanza. */
  remove(path: string): Promise<void>;
}
