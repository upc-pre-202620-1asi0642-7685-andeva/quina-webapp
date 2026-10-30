import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// La aplicación se conecta como quina_app (sin BYPASSRLS) por Supavisor en modo
// transacción, que no admite sentencias preparadas: de ahí `prepare: false`.
export function createDb(url: string) {
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

let instance: Database | undefined;

function getDb(): Database {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('Falta la variable de entorno DATABASE_URL.');
    }
    instance = createDb(url);
  }
  return instance;
}

// Se crea en el primer uso: importar este módulo sin DATABASE_URL (pruebas
// unitarias, build) no falla; falla la primera consulta.
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = getDb();
    const value: unknown = Reflect.get(real, property, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

// Cierra el pool (pruebas y scripts). Un uso posterior abre uno nuevo.
export async function closeDb(): Promise<void> {
  if (instance) {
    const current = instance;
    instance = undefined;
    await current.$client.end();
  }
}
