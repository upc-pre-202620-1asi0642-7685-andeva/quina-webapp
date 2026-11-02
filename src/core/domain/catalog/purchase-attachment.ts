import { err, ok, type Result } from '@/core/domain/shared/result';

export type PurchaseAttachmentError = 'ATTACHMENT_TYPE' | 'ATTACHMENT_TOO_LARGE';

/** 5 MB: límite de `chk_purchase_attachments_file_size` (US15 crit. 3). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;

export type AttachmentMimeType = keyof typeof EXTENSIONS;

export const ATTACHMENT_MIME_TYPES = Object.keys(EXTENSIONS) as AttachmentMimeType[];

export type PurchaseAttachment = {
  fileName: string;
  contentType: AttachmentMimeType;
  extension: string;
  fileSize: number;
  bytes: Uint8Array;
};

function sanitizeFileName(raw: string, fallbackExt: string): string {
  const clean = raw
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ');
  if (!clean) return `comprobante.${fallbackExt}`;
  return clean.slice(0, 255);
}

export const PurchaseAttachment = {
  /** Comprobante de compra (US15 crit. 3): JPG, PNG, WEBP o PDF de hasta 5 MB. */
  parse(input: {
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
  }): Result<PurchaseAttachment, PurchaseAttachmentError> {
    if (!(input.contentType in EXTENSIONS)) return err('ATTACHMENT_TYPE');
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return err('ATTACHMENT_TOO_LARGE');
    }
    const contentType = input.contentType as AttachmentMimeType;
    const extension = EXTENSIONS[contentType];
    return ok({
      fileName: sanitizeFileName(input.fileName, extension),
      contentType,
      extension,
      fileSize: input.bytes.byteLength,
      bytes: input.bytes,
    });
  },
};
