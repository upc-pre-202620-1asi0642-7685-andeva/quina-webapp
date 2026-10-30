import { sql, type SQL } from 'drizzle-orm';
import { numeric, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// Bloques reutilizables del esquema. Cada función devuelve un constructor nuevo
// porque Drizzle no admite compartir la misma instancia entre tablas.

export const uuidPk = () => uuid('id').primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const tstz = (name: string) => timestamp(name, { withTimezone: true });

// Dinero: NUMERIC llega como texto y se convierte al objeto de valor Money.
export const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

// Solo literales del código, nunca entrada del usuario (se interpolan con sql.raw).
// `col IN ('A', 'B')` para los CHECK de listas cerradas.
export const oneOf = (column: AnyPgColumn, values: readonly (string | number)[]): SQL =>
  sql`${column} in (${sql.join(
    values.map((value) =>
      typeof value === 'number' ? sql.raw(String(value)) : sql.raw(`'${value}'`),
    ),
    sql`, `,
  )})`;
