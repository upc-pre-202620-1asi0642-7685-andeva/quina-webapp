import { err, ok, type Result } from '@/core/domain/shared/result';

export type PersonNameError = 'NAME_REQUIRED' | 'NAME_INVALID';

const MIN_LENGTH = 2;
const MAX_LENGTH = 150;
// Letras de cualquier alfabeto (tildes, ñ, ü) separadas por un espacio, apóstrofo o guion
const PATTERN = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;

export const PersonName = {
  /** Quita los espacios de los extremos y junta los repetidos. */
  parse(raw: string): Result<string, PersonNameError> {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) return err('NAME_REQUIRED');
    if (!PATTERN.test(name)) return err('NAME_INVALID');
    return ok(name);
  },
};
