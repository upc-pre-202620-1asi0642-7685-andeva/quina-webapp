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

export function getDb(): Database {
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
// El proxy se comporta como la instancia real: las propiedades propias ($client,
// _, query) salen tal cual y solo los métodos de la clase se atan a la instancia,
// para que `db.select()` funcione aunque se llame desde un adaptador.
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = getDb();
    const value: unknown = Reflect.get(real, property, real);
    if (typeof value !== 'function' || Object.prototype.hasOwnProperty.call(real, property)) {
      return value;
    }
    return value.bind(real);
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(getDb());
  },
  ownKeys() {
    return Reflect.ownKeys(getDb());
  },
  getOwnPropertyDescriptor(_target, property) {
    const descriptor = Reflect.getOwnPropertyDescriptor(getDb(), property);
    // Un proxy sobre un objeto vacío solo puede reportar propiedades configurables
    return descriptor ? { ...descriptor, configurable: true } : undefined;
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
