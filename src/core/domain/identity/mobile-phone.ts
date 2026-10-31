import { err, ok, type Result } from '@/core/domain/shared/result';

export const MobilePhone = {
  /** Celular peruano de 9 dígitos que empieza con 9; acepta el prefijo +51 y espacios. */
  parse(raw: string): Result<string, 'PHONE_INVALID'> {
    const digits = raw.replace(/[\s()-]/g, '').replace(/^\+?51(?=9\d{8}$)/, '');
    if (!/^9\d{8}$/.test(digits)) return err('PHONE_INVALID');
    return ok(digits);
  },
};
