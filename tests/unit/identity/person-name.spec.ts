import { describe, expect, it } from 'vitest';
import { PersonName } from '@/core/domain/identity/person-name';

describe('PersonName', () => {
  it.each(['María José', "O'Higgins", 'Quispe-Mamani', 'Ñahui', 'Hunt’asqa Mamani', 'Jürgen'])(
    'acepta %s',
    (name) => {
      expect(PersonName.parse(name)).toEqual({ ok: true, value: name });
    },
  );

  it('quita los espacios de los extremos y junta los repetidos', () => {
    expect(PersonName.parse('  Lucho   Quispe ')).toEqual({ ok: true, value: 'Lucho Quispe' });
  });

  it.each(['Juan123', '-Ana', 'Ana-', 'Ana--Luz', "Ana ' Luz", 'Rosa 🙂', 'Juan_Pérez', 'Ana.'])(
    'rechaza %s por sus caracteres',
    (name) => {
      expect(PersonName.parse(name)).toEqual({ ok: false, error: 'NAME_INVALID' });
    },
  );

  it.each(['', ' ', 'J', 'a'.repeat(151)])(
    'pide nombre si tiene menos de 2 o más de 150',
    (name) => {
      expect(PersonName.parse(name)).toEqual({ ok: false, error: 'NAME_REQUIRED' });
    },
  );
});
