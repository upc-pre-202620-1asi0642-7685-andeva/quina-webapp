import { describe, expect, it } from 'vitest';
import { PasswordPolicy } from '@/core/domain/identity/password-policy';

describe('PasswordPolicy.check', () => {
  it('acepta una contraseña que cumple todo', () => {
    expect(PasswordPolicy.check('Bodega2026!').ok).toBe(true);
  });

  it('lista todas las reglas incumplidas en orden', () => {
    expect(PasswordPolicy.check('bodega')).toEqual({
      ok: false,
      error: ['MIN_LENGTH', 'UPPERCASE', 'NUMBER', 'SYMBOL'],
    });
  });

  it('solo lista las reglas que faltan', () => {
    expect(PasswordPolicy.check('Bodega2026')).toEqual({ ok: false, error: ['SYMBOL'] });
    expect(PasswordPolicy.check('bodega2026!')).toEqual({ ok: false, error: ['UPPERCASE'] });
    expect(PasswordPolicy.check('Bodega!!!')).toEqual({ ok: false, error: ['NUMBER'] });
    expect(PasswordPolicy.check('Bo1!')).toEqual({ ok: false, error: ['MIN_LENGTH'] });
  });

  it('cuenta la Ñ como mayúscula', () => {
    expect(PasswordPolicy.check('Ñandu2026!').ok).toBe(true);
  });

  it('no cuenta el espacio como símbolo', () => {
    expect(PasswordPolicy.check('Bodega 2026')).toEqual({ ok: false, error: ['SYMBOL'] });
  });
});
