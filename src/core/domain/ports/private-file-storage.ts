import type { ImageType } from '../catalog/product-image';

/** Archivos privados de la tienda (QR de cobro, Plan 5 P3): solo se ven con una URL firmada. */
export interface PrivateFileStorage {
  upload(input: { path: string; contentType: ImageType; bytes: Uint8Array }): Promise<void>;
  /** URL temporal para mostrar el archivo; null si no existe. */
  signedUrl(path: string, expiresInSeconds: number): Promise<string | null>;
  /** Borra un archivo reemplazado; nunca lanza. */
  remove(path: string): Promise<void>;
}
