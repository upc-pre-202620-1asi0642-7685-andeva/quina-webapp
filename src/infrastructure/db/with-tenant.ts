import { sql } from 'drizzle-orm';
import { db, type Database } from './connection';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

// Toda operación de negocio corre aquí: fija la tienda solo para esta
// transacción (set_config con is_local = true), así que es compatible con el
// pool de Supavisor y las políticas RLS de la migración 0001 filtran por ella.
// `database` permite usar una instancia inyectada (Better Auth recibe la suya).
export async function withTenant<T>(
  storeId: string,
  work: (tx: Tx) => Promise<T>,
  database: Database = db,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_store_id', ${storeId}, true)`);
    return work(tx);
  });
}
