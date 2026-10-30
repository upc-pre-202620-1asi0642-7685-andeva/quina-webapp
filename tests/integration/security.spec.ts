import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/infrastructure/db/connection';
import { withTenant } from '@/infrastructure/db/with-tenant';
import {
  auditLogs,
  customers,
  rusCategories,
  stores,
  units,
  users,
} from '@/infrastructure/db/schema';
import { testEnv } from './env';

// Conexión de mantenimiento (migrator): solo para preparar escenarios que la app
// no puede crear y para revisar el catálogo. Las pruebas de seguridad usan `db`,
// que se conecta como quina_app (DATABASE_URL apunta a DATABASE_TEST_APP_URL).
const owner = postgres(testEnv.ownerUrl, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner.end();
  await closeDb();
});

// Drizzle envuelve el error de PostgreSQL; el código SQLSTATE queda en `cause`.
async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const pgError = (error as { cause?: { code?: string } }).cause ?? error;
    return (pgError as { code?: string }).code;
  }
  throw new Error('Se esperaba un error de PostgreSQL y la consulta pasó.');
}

async function errorMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const pgError = (error as { cause?: { message?: string } }).cause ?? error;
    return String((pgError as { message?: string }).message);
  }
  throw new Error('Se esperaba un error de PostgreSQL y la consulta pasó.');
}

// stores no tiene RLS: quina_app la crea sin contexto, como en el registro.
async function createStore(isActive = true): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '');
  const [store] = await db
    .insert(stores)
    .values({
      commercialName: `Bodega ${suffix.slice(0, 8)}`,
      businessTurn: 'BODEGA',
      taxIdType: 'RUC',
      taxIdNumber: `20${String(randomInt(1e9)).padStart(9, '0')}`,
      ownerFullName: 'Rosa Quispe',
      contactEmail: `${suffix}@example.test`,
      isActive,
    })
    .returning({ id: stores.id });
  return store!.id;
}

function unitCode(): string {
  return randomUUID().slice(0, 8);
}

describe('aislamiento por tienda (RLS)', () => {
  it('sin withTenant, quina_app no ve clientes', async () => {
    const storeId = await createStore();
    await withTenant(storeId, (tx) =>
      tx.insert(customers).values({
        storeId,
        documentType: 'DNI',
        documentNumber: '45678901',
        firstName: 'Rosa',
        lastName: 'Quispe',
        email: `${randomUUID()}@example.test`,
      }),
    );

    const visible = await db.select().from(customers);
    expect(visible).toHaveLength(0);

    const inTenant = await withTenant(storeId, (tx) => tx.select().from(customers));
    expect(inTenant).toHaveLength(1);
  });

  it('la tienda A no ve las unidades de la tienda B', async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const codeA = unitCode();
    const codeB = unitCode();
    await withTenant(storeA, (tx) =>
      tx.insert(units).values({ storeId: storeA, code: codeA, name: 'Unidad A' }),
    );
    await withTenant(storeB, (tx) =>
      tx.insert(units).values({ storeId: storeB, code: codeB, name: 'Unidad B' }),
    );

    const seenByA = await withTenant(storeA, (tx) => tx.select().from(units));
    expect(seenByA.map((unit) => unit.code)).toEqual([codeA]);
  });

  it('dentro de withTenant(A) no se puede insertar con el store_id de B', async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const message = await errorMessage(
      withTenant(storeA, (tx) =>
        tx.insert(units).values({ storeId: storeB, code: unitCode(), name: 'Intrusa' }),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it('el contexto de tienda no sobrevive a la transacción', async () => {
    const storeId = await createStore();
    await withTenant(storeId, (tx) =>
      tx.insert(units).values({ storeId, code: unitCode(), name: 'Unidad' }),
    );
    const [setting] = await db.execute<{ value: string | null }>(
      sql`SELECT current_setting('app.current_store_id', true) AS value`,
    );
    expect(setting?.value ?? '').toBe('');
    expect(await db.select().from(units)).toHaveLength(0);
  });

  it('quina_app lista las tiendas activas sin contexto de tienda (base del proceso diario)', async () => {
    const active = await createStore(true);
    const inactive = await createStore(false);
    const rows = await db.select({ id: stores.id }).from(stores).where(eq(stores.isActive, true));
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(active);
    expect(ids).not.toContain(inactive);
  });

  it('acepta un audit_log de plataforma (store_id NULL) sin contexto', async () => {
    await expect(
      db.insert(auditLogs).values({ action: 'PLATFORM_TEST', entityName: 'stores' }),
    ).resolves.toBeDefined();
  });

  it('las 27 tablas con store_id tienen RLS forzado y política tenant_isolation', async () => {
    const rows = await owner<{ table_name: string; forced: boolean; policies: number }[]>`
      SELECT c.relname AS table_name,
             c.relrowsecurity AND c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname
                 AND p.policyname = 'tenant_isolation') AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema = 'public' AND col.table_name = c.relname
                        AND col.column_name = 'store_id')
         AND c.relname <> 'users'
       ORDER BY c.relname`;
    expect(rows).toHaveLength(27);
    expect(rows.filter((row) => !row.forced || row.policies !== 1)).toEqual([]);
  });
});

describe('inmutabilidad', () => {
  it('UPDATE sobre audit_logs falla con forbid_mutation', async () => {
    const storeId = await createStore();
    await withTenant(storeId, (tx) =>
      tx.insert(auditLogs).values({ storeId, action: 'CREATE', entityName: 'units' }),
    );
    const message = await errorMessage(
      withTenant(storeId, (tx) =>
        tx.update(auditLogs).set({ action: 'TAMPERED' }).where(eq(auditLogs.storeId, storeId)),
      ),
    );
    expect(message).toMatch(/solo inserción/);
  });

  it('DELETE sobre audit_logs falla con forbid_mutation', async () => {
    const storeId = await createStore();
    await withTenant(storeId, (tx) =>
      tx.insert(auditLogs).values({ storeId, action: 'CREATE', entityName: 'units' }),
    );
    const state = await sqlState(
      withTenant(storeId, (tx) => tx.delete(auditLogs).where(eq(auditLogs.storeId, storeId))),
    );
    expect(state).toBe('23001');
  });

  it('las 10 tablas inmutables tienen su trigger', async () => {
    const rows = await owner<{ table_name: string }[]>`
      SELECT c.relname AS table_name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE p.proname = 'forbid_mutation' AND NOT t.tgisinternal
       ORDER BY c.relname`;
    expect(rows.map((row) => row.table_name)).toEqual([
      'audit_logs',
      'credit_charge_voids',
      'customer_consents',
      'debt_payments',
      'inventory_movements',
      'payment_allocations',
      'product_price_history',
      'sale_items',
      'sales',
      'subscription_payments',
    ]);
  });
});

describe('permisos de quina_app', () => {
  it('no puede insertar en rus_categories (tabla de plataforma)', async () => {
    const state = await sqlState(
      db.insert(rusCategories).values({
        category: 1,
        monthlyIncomeCap: '5000.00',
        monthlyPurchasesCap: '5000.00',
        validFrom: '2026-01-01',
      }),
    );
    expect(state).toBe('42501');
  });

  it('puede leer rus_categories', async () => {
    await expect(db.select().from(rusCategories)).resolves.toBeDefined();
  });

  it('los roles tienen los atributos esperados', async () => {
    const rows = await owner<{ rolname: string; rolcanlogin: boolean; rolbypassrls: boolean }[]>`
      SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles
       WHERE rolname IN ('quina_app', 'quina_platform') ORDER BY rolname`;
    expect(rows).toEqual([
      { rolname: 'quina_app', rolcanlogin: true, rolbypassrls: false },
      { rolname: 'quina_platform', rolcanlogin: true, rolbypassrls: true },
    ]);
  });

  it('una tabla creada por una migración posterior queda con permisos para quina_app', async () => {
    const table = `future_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    await owner.unsafe(`CREATE TABLE ${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);
    try {
      await db.execute(sql.raw(`INSERT INTO ${table} DEFAULT VALUES`));
      const rows = await db.execute(sql.raw(`SELECT id FROM ${table}`));
      expect(rows).toHaveLength(1);
    } finally {
      await owner.unsafe(`DROP TABLE ${table}`);
    }
  });
});

describe('restricciones de users', () => {
  function userValues(role: string, storeId: string | null) {
    return {
      name: 'Rosa Quispe',
      email: `${randomUUID()}@example.test`,
      role,
      storeId,
    };
  }

  it('PENDING_OWNER con store_id viola el check', async () => {
    const storeId = await createStore();
    const state = await sqlState(db.insert(users).values(userValues('PENDING_OWNER', storeId)));
    expect(state).toBe('23514');
  });

  it('STORE_OWNER sin store_id viola el check', async () => {
    const state = await sqlState(db.insert(users).values(userValues('STORE_OWNER', null)));
    expect(state).toBe('23514');
  });
});

describe('idempotencia de las migraciones', () => {
  it('volver a correr migrate sobre la base ya migrada no hace nada ni falla', async () => {
    await expect(migrate(drizzle(owner), { migrationsFolder: 'drizzle' })).resolves.toBeUndefined();
  });

  it('volver a ejecutar 0001_security.sql completo no falla', async () => {
    const statements = readFileSync('drizzle/0001_security.sql', 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await owner.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
    });
  });
});
