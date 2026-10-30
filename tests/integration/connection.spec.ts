import { sql } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db, getDb } from '@/infrastructure/db/connection';

afterAll(async () => {
  await closeDb();
});

// Better Auth (drizzleAdapter) y withTenant reciben `db`: el proxy perezoso debe
// comportarse como la instancia real de Drizzle.
describe('db (proxy perezoso)', () => {
  it('expone $client intacto, con sus métodos de postgres-js', async () => {
    expect(db.$client).toBe(getDb().$client);
    expect(typeof db.$client.end).toBe('function');
    expect(typeof db.$client.begin).toBe('function');
    const [row] = await db.$client.unsafe<{ user: string }[]>('SELECT current_user AS user');
    expect(row?.user).toBe('quina_app');
  });

  it('es instancia de PgDatabase y expone sus propiedades propias', () => {
    expect(db).toBeInstanceOf(PgDatabase);
    expect(Object.keys(db)).toEqual(expect.arrayContaining(['$client', '_', 'query']));
    expect(db._).toBe(getDb()._);
  });

  it('db.transaction funciona a través del proxy', async () => {
    const value = await db.transaction(async (tx) => {
      const [row] = await tx.execute<{ one: number }>(sql`SELECT 1 AS one`);
      return row?.one;
    });
    expect(value).toBe(1);
  });
});
