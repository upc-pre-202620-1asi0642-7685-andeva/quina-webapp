import { err, ok, type Result } from '@/core/domain/shared/result';

export type ProductImageError = 'IMAGE_TYPE' | 'IMAGE_TOO_LARGE';

/** 2 MB: una foto de celular comprimida, sin pasar el límite de la Server Action. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

export type ImageType = keyof typeof EXTENSIONS;

export const IMAGE_TYPES = Object.keys(EXTENSIONS) as ImageType[];

export type ProductImage = { contentType: ImageType; extension: string; bytes: Uint8Array };

export const ProductImage = {
  /** Imagen del catálogo (US03 crit. 3): JPG, PNG o WEBP de hasta 2 MB. */
  parse(contentType: string, bytes: Uint8Array): Result<ProductImage, ProductImageError> {
    if (!(contentType in EXTENSIONS)) return err('IMAGE_TYPE');
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return err('IMAGE_TOO_LARGE');
    const type = contentType as ImageType;
    return ok({ contentType: type, extension: EXTENSIONS[type], bytes });
  },
};
