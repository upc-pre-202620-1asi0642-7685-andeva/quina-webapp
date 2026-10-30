import { describe, expect, it } from 'vitest';
import { assertResettableDatabase } from '../../integration/reset-guard';

describe('assertResettableDatabase', () => {
  it('permite bases cuyo nombre contiene "test"', () => {
    expect(() => assertResettableDatabase('quina_test', {})).not.toThrow();
    expect(() => assertResettableDatabase('QUINA_TEST_CI', {})).not.toThrow();
  });

  it('rechaza una base que no es de pruebas', () => {
    expect(() => assertResettableDatabase('postgres', {})).toThrow(/no parece de pruebas/);
    expect(() => assertResettableDatabase('quina_dev', { QUINA_ALLOW_DB_RESET: 'true' })).toThrow(
      /no parece de pruebas/,
    );
  });

  it('permite cualquier base solo con QUINA_ALLOW_DB_RESET=1', () => {
    expect(() => assertResettableDatabase('postgres', { QUINA_ALLOW_DB_RESET: '1' })).not.toThrow();
  });
});
