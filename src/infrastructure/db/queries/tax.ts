import { and, desc, eq, gte, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import { BusinessDate } from '@/core/domain/shared/business-date';
import {
  rusMonth,
  type RusCategory,
  type TaxRegime,
  type TaxSettings,
} from '@/core/domain/tax/rus';
import { db } from '../connection';
import { creditChargeVoids, purchases, rusCategories, sales, stores } from '../schema';
import { withTenant } from '../with-tenant';

/** `stores` no tiene RLS: el régimen se lee con quina_app sin contexto. */
export async function getTaxSettings(storeId: string): Promise<TaxSettings> {
  const [row] = await db
    .select({ taxRegime: stores.taxRegime, rusCategory: stores.rusCategory })
    .from(stores)
    .where(eq(stores.id, storeId));
  if (!row) throw new Error(`La tienda ${storeId} no existe`);
  return { taxRegime: row.taxRegime as TaxRegime, rusCategory: row.rusCategory as RusCategory };
}

export type RusStatus = {
  category: RusCategory;
  /** Ventas y compras del mes de Lima en curso, texto con 2 decimales. */
  sales: string;
  purchases: string;
  /** `null` si el Administrador aún no registró un tope vigente. */
  caps: { income: string; purchases: string } | null;
};

/**
 * US21: lo vendido y lo comprado en el mes frente a los topes de la categoría.
 * `null` si la tienda no está en el Nuevo RUS (el asistente no aplica).
 */
export async function loadRusStatus(storeId: string, now: Date): Promise<RusStatus | null> {
  const settings = await getTaxSettings(storeId);
  if (settings.taxRegime !== 'NUEVO_RUS') return null;
  const { from, to } = rusMonth(now);
  const fromISO = BusinessDate.toISO(from);
  const toISO = BusinessDate.toISO(to);

  const [cap] = await db
    .select({
      income: rusCategories.monthlyIncomeCap,
      purchases: rusCategories.monthlyPurchasesCap,
    })
    .from(rusCategories)
    .where(
      and(
        eq(rusCategories.category, settings.rusCategory),
        lte(rusCategories.validFrom, toISO),
        or(isNull(rusCategories.validTo), gte(rusCategories.validTo, fromISO)),
      ),
    )
    .orderBy(desc(rusCategories.validFrom))
    .limit(1);

  const totals = await withTenant(storeId, async (tx) => {
    // La suma sale de PostgreSQL como texto: nunca pasa por `number`
    const [sold] = await tx
      .select({ total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)::numeric(12, 2)::text` })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, storeId),
          gte(sales.saleDate, BusinessDate.startInstant(from)),
          lte(sales.saleDate, BusinessDate.endInstant(to)),
          // Un fiado anulado no fue un ingreso (Plan 4, P2)
          notExists(
            tx
              .select({ id: creditChargeVoids.id })
              .from(creditChargeVoids)
              .where(eq(creditChargeVoids.saleId, sales.id)),
          ),
        ),
      );
    const [bought] = await tx
      .select({
        total: sql<string>`coalesce(sum(${purchases.totalAmount}), 0)::numeric(12, 2)::text`,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.storeId, storeId),
          gte(purchases.issueDate, fromISO),
          lte(purchases.issueDate, toISO),
        ),
      );
    return { sales: sold?.total ?? '0.00', purchases: bought?.total ?? '0.00' };
  });

  return { category: settings.rusCategory, ...totals, caps: cap ?? null };
}
