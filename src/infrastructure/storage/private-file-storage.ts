import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ImageType } from '@/core/domain/catalog/product-image';
import type { PrivateFileStorage } from '@/core/domain/ports/private-file-storage';

export const STORE_FILES_BUCKET = 'store-files';

/**
 * Bucket privado de Supabase Storage (Plan 5, P3). Solo el servidor sube y firma
 * URLs con la clave de servicio; el vecino nunca recibe la ruta del bucket.
 */
export class SupabasePrivateFileStorage implements PrivateFileStorage {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async upload(input: { path: string; contentType: ImageType; bytes: Uint8Array }) {
    const bucket = this.client.storage.from(STORE_FILES_BUCKET);
    const send = () =>
      bucket.upload(input.path, input.bytes, { contentType: input.contentType, upsert: false });
    let { error } = await send();
    if (error && /bucket not found/i.test(error.message)) {
      // Primer uso en un proyecto nuevo, como el bucket del catálogo
      await this.client.storage.createBucket(STORE_FILES_BUCKET, {
        public: false,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: IMAGE_TYPES,
      });
      ({ error } = await send());
    }
    if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  }

  async signedUrl(filePath: string, expiresInSeconds: number) {
    const { data, error } = await this.client.storage
      .from(STORE_FILES_BUCKET)
      .createSignedUrl(filePath, expiresInSeconds);
    return error ? null : data.signedUrl;
  }

  async remove(filePath: string) {
    try {
      await this.client.storage.from(STORE_FILES_BUCKET).remove([filePath]);
    } catch {
      // Un archivo huérfano no debe tumbar la operación del dueño
    }
  }
}

const ROOT = path.join(process.cwd(), '.private-uploads');
const TYPES: Record<string, ImageType> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Desarrollo y e2e: guarda fuera de `public/` y "firma" con una URL data:, así
 * nada privado queda servido como archivo estático.
 */
export class LocalPrivateFileStorage implements PrivateFileStorage {
  async upload(input: { path: string; bytes: Uint8Array }) {
    const target = this.resolve(input.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.bytes);
  }

  async signedUrl(filePath: string) {
    const type = TYPES[filePath.split('.').pop() ?? ''];
    if (!type) return null;
    try {
      return `data:${type};base64,${(await readFile(this.resolve(filePath))).toString('base64')}`;
    } catch {
      return null;
    }
  }

  async remove(filePath: string) {
    await rm(this.resolve(filePath), { force: true }).catch(() => undefined);
  }

  private resolve(relative: string): string {
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep))
      throw new Error('Ruta fuera del almacenamiento privado');
    return target;
  }
}
