import type { ImageType } from '../catalog/product-image';

export type StoredImage = { path: string; url: string };

/** Imágenes del catálogo en un bucket público (US03 crit. 3). */
export interface ImageStorage {
  upload(input: { path: string; contentType: ImageType; bytes: Uint8Array }): Promise<StoredImage>;
  /**
   * Borra, por su URL pública, una imagen que no llegó a guardarse o que fue
   * reemplazada. Ignora URLs ajenas al bucket y nunca lanza.
   */
  remove(url: string): Promise<void>;
}
