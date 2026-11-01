import { describe, expect, it } from 'vitest';
import { authorizeCron, resolveNow, resolveStoreScope } from '@/presentation/lib/cron-request';

const REAL = new Date('2026-09-21T11:00:00Z');
const SIMULATED = '2026-10-27T11:00:00.000Z';

describe('authorizeCron', () => {
  it('exige el Bearer con CRON_SECRET', () => {
    const env = { CRON_SECRET: 's3cret' };
    expect(authorizeCron('Bearer s3cret', env)).toBe(true);
    expect(authorizeCron('Bearer otro', env)).toBe(false);
    expect(authorizeCron(null, env)).toBe(false);
  });

  it('sin CRON_SECRET configurado, rechaza todo', () => {
    expect(authorizeCron('Bearer ', {})).toBe(false);
    expect(authorizeCron('Bearer undefined', {})).toBe(false);
  });
});

describe('resolveNow (D17)', () => {
  it('usa la fecha simulada solo fuera de producción y con ALLOW_SIMULATED_NOW=1', () => {
    expect(resolveNow(SIMULATED, { ALLOW_SIMULATED_NOW: '1' }, REAL).toISOString()).toBe(SIMULATED);
  });

  it('en producción ignora la fecha simulada aunque esté permitida', () => {
    const env = { ALLOW_SIMULATED_NOW: '1', VERCEL_ENV: 'production' };
    expect(resolveNow(SIMULATED, env, REAL)).toEqual(REAL);
  });

  it('sin el permiso explícito o con una fecha inválida usa la hora real', () => {
    expect(resolveNow(SIMULATED, {}, REAL)).toEqual(REAL);
    expect(resolveNow('mañana', { ALLOW_SIMULATED_NOW: '1' }, REAL)).toEqual(REAL);
    expect(resolveNow(null, { ALLOW_SIMULATED_NOW: '1' }, REAL)).toEqual(REAL);
  });
});

describe('resolveStoreScope (pruebas e2e y demo)', () => {
  const id = '3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f';

  it('acota el proceso a una tienda solo con el mismo permiso que la fecha simulada', () => {
    expect(resolveStoreScope(id, { ALLOW_SIMULATED_NOW: '1' })).toEqual([id]);
    expect(resolveStoreScope(id, {})).toBeUndefined();
    expect(
      resolveStoreScope(id, { ALLOW_SIMULATED_NOW: '1', VERCEL_ENV: 'production' }),
    ).toBeUndefined();
  });

  it('ignora un id que no es UUID', () => {
    expect(resolveStoreScope('todas', { ALLOW_SIMULATED_NOW: '1' })).toBeUndefined();
    expect(resolveStoreScope(null, { ALLOW_SIMULATED_NOW: '1' })).toBeUndefined();
  });
});
