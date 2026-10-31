import { describe, expect, it } from 'vitest';
import { DocumentId } from '@/core/domain/identity/document-id';

describe('DocumentId.parse', () => {
  it('acepta un DNI de 8 dígitos quitando espacios y guiones', () => {
    expect(DocumentId.parse('DNI', ' 4567-8901 ')).toEqual({
      ok: true,
      value: { type: 'DNI', number: '45678901' },
    });
  });

  it('rechaza un DNI que no tiene 8 dígitos', () => {
    expect(DocumentId.parse('DNI', '1234567')).toEqual({ ok: false, error: 'DOCUMENT_INVALID' });
    expect(DocumentId.parse('DNI', '1234567A')).toEqual({ ok: false, error: 'DOCUMENT_INVALID' });
  });

  it('acepta un carné de extranjería de 9 a 12 caracteres y lo pasa a mayúsculas', () => {
    expect(DocumentId.parse('CE', '001234567')).toEqual({
      ok: true,
      value: { type: 'CE', number: '001234567' },
    });
    expect(DocumentId.parse('CE', 'ab1234567890')).toEqual({
      ok: true,
      value: { type: 'CE', number: 'AB1234567890' },
    });
    expect(DocumentId.parse('CE', '12345678')).toEqual({ ok: false, error: 'DOCUMENT_INVALID' });
  });

  it('acepta un pasaporte de 6 a 12 caracteres alfanuméricos', () => {
    expect(DocumentId.parse('PASAPORTE', 'x12345')).toEqual({
      ok: true,
      value: { type: 'PASAPORTE', number: 'X12345' },
    });
    expect(DocumentId.parse('PASAPORTE', '12345')).toEqual({
      ok: false,
      error: 'DOCUMENT_INVALID',
    });
    expect(DocumentId.parse('PASAPORTE', 'AB12345678901')).toEqual({
      ok: false,
      error: 'DOCUMENT_INVALID',
    });
  });
});
