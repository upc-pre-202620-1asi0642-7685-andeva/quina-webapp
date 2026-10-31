import { err, ok, type Result } from '@/core/domain/shared/result';

export const DOCUMENT_TYPES = ['DNI', 'CE', 'PASAPORTE'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Documento de identidad del vecino (US04 crit. 1). */
export type DocumentId = { type: DocumentType; number: string };

const FORMATS: Record<DocumentType, RegExp> = {
  DNI: /^\d{8}$/,
  CE: /^[A-Z0-9]{9,12}$/,
  PASAPORTE: /^[A-Z0-9]{6,12}$/,
};

export const DocumentId = {
  /** Quita espacios y guiones y pasa a mayúsculas antes de validar el formato. */
  parse(type: DocumentType, raw: string): Result<DocumentId, 'DOCUMENT_INVALID'> {
    const number = raw.replace(/[\s-]/g, '').toUpperCase();
    if (!FORMATS[type].test(number)) return err('DOCUMENT_INVALID');
    return ok({ type, number });
  },
};
