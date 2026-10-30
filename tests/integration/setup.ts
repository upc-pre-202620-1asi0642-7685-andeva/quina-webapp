import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { applyRolePasswords } from '../../scripts/db-roles';
import { testEnv } from './env';

// Deja la base de pruebas como recién creada: las tablas inmutables no se pueden
// limpiar con DELETE, así que se borra el esquema completo y se vuelve a migrar.
export default async function setup() {
  for (const name of ['DATABASE_URL', 'DATABASE_MIGRATION_URL']) {
    if (process.env[name] && process.env[name] === testEnv.ownerUrl) {
      throw new Error(`DATABASE_TEST_URL no puede ser la misma base que ${name}.`);
    }
  }

  const client = postgres(testEnv.ownerUrl, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await client.unsafe('CREATE SCHEMA public');
    await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
    await applyRolePasswords({
      url: testEnv.ownerUrl,
      appPassword: testEnv.appPassword,
      platformPassword: testEnv.platformPassword,
    });
  } finally {
    await client.end();
  }
}
