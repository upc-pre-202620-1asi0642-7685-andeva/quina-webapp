import { afterEach, describe, expect, it, vi } from 'vitest';

describe('db (conexión perezosa)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('se importa sin DATABASE_URL y falla recién en el primer uso', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { db } = await import('@/infrastructure/db/connection');
    expect(() => db.select()).toThrow(/DATABASE_URL/);
  });
});
