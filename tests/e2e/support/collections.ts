import { expect, type APIRequestContext } from '@playwright/test';
import postgres from 'postgres';

const APP_DB =
  process.env.DATABASE_URL ?? 'postgres://quina_app:quina_app_test@localhost:54329/quina_test';
const CRON_SECRET = process.env.CRON_SECRET ?? 'e2e-cron-secret';

/** Tienda creada por la prueba, por su RUC (`stores` no tiene RLS). */
export async function storeIdOf(ruc: string): Promise<string> {
  const sql = postgres(APP_DB, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [row] = await sql<{ id: string }[]>`SELECT id FROM stores WHERE tax_id_number = ${ruc}`;
    if (!row) throw new Error(`No hay tienda con RUC ${ruc}`);
    return row.id;
  } finally {
    await sql.end();
  }
}

/** Fecha de corte del ciclo abierto de la tienda, leída con RLS como la app. */
export async function openCutOff(storeId: string): Promise<Date> {
  const sql = postgres(APP_DB, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_store_id', ${storeId}, true)`;
      const [row] = await tx<{ cut_off_date: Date }[]>`
        SELECT cut_off_date FROM settlement_cycles WHERE status = 'OPEN' ORDER BY cut_off_date LIMIT 1`;
      if (!row) throw new Error('No hay ciclo abierto');
      return row.cut_off_date;
    });
  } finally {
    await sql.end();
  }
}

/** Corre el proceso diario de una sola tienda en una fecha simulada (D17). */
export async function runDaily(request: APIRequestContext, storeId: string, now: Date) {
  const response = await request.get('./api/cron/daily', {
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
      'x-quina-now': now.toISOString(),
      'x-quina-store': storeId,
    },
  });
  expect(response.ok()).toBe(true);
  const summary = (await response.json()) as { errors: unknown[]; stores: number };
  expect(summary.errors).toEqual([]);
  expect(summary.stores).toBe(1);
  return summary;
}

/** Termina la prueba Pro de la tienda: queda en Casero, con los avisos manuales (P5). */
export async function endTrial(storeId: string) {
  const sql = postgres(APP_DB, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_store_id', ${storeId}, true)`;
      await tx`UPDATE store_subscriptions SET trial_ends_at = now() - interval '1 day'
        WHERE store_id = ${storeId}`;
    });
  } finally {
    await sql.end();
  }
}
