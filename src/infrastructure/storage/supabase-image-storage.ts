import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ImageType } from '@/core/domain/catalog/product-image';
import type { ImageStorage, StoredImage } from '@/core/domain/ports/image-storage';

export const PRODUCT_IMAGES_BUCKET = 'product-images';

/**
 * Bucket público de Supabase Storage para el catálogo (US03 crit. 3, D11). Solo
 * el servidor sube y borra, con la clave de servicio; nunca se usa para tablas.
 */
export class SupabaseImageStorage implements ImageStorage {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async upload(input: {
    path: string;
    contentType: ImageType;
    bytes: Uint8Array;
  }): Promise<StoredImage> {
    const bucket = this.client.storage.from(PRODUCT_IMAGES_BUCKET);
    const send = () =>
      bucket.upload(input.path, input.bytes, { contentType: input.contentType, upsert: false });
    let { error } = await send();
    if (error && /bucket not found/i.test(error.message)) {
      // Primer uso en un proyecto nuevo: se crea el bucket con sus mismos límites
      await this.client.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: IMAGE_TYPES,
      });
      ({ error } = await send());
    }
    if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
    return { path: input.path, url: bucket.getPublicUrl(input.path).data.publicUrl };
  }

  async remove(url: string): Promise<void> {
    const prefix = this.client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl('').data.publicUrl;
    if (!url.startsWith(prefix)) return;
    try {
      await this.client.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .remove([decodeURIComponent(url.slice(prefix.length))]);
    } catch {
      // Un archivo huérfano no debe tumbar la operación del dueño
    }
  }
}
