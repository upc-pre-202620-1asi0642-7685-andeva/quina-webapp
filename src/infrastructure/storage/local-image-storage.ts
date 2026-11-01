import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageStorage, StoredImage } from '@/core/domain/ports/image-storage';

/** Debe coincidir con `basePath` de next.config.ts. */
const URL_PREFIX = '/app/uploads/product-images/';
const ROOT = path.join(process.cwd(), 'public', 'uploads', 'product-images');

/**
 * Desarrollo y pruebas e2e: guarda las imágenes en `public/uploads` (fuera de
 * git), que Next sirve como archivos estáticos bajo /app.
 */
export class LocalImageStorage implements ImageStorage {
  async upload(input: { path: string; bytes: Uint8Array }): Promise<StoredImage> {
    const target = this.resolve(input.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.bytes);
    return { path: input.path, url: `${URL_PREFIX}${input.path}` };
  }

  async remove(url: string): Promise<void> {
    if (!url.startsWith(URL_PREFIX)) return;
    await rm(this.resolve(url.slice(URL_PREFIX.length)), { force: true }).catch(() => undefined);
  }

  private resolve(relative: string): string {
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep)) throw new Error('Ruta de imagen fuera del bucket');
    return target;
  }
}
