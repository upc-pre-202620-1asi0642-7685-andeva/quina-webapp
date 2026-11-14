import { eq } from 'drizzle-orm';
import { db } from '../connection';
import { users } from '../schema';

/** Diseño de Inicio guardado por el usuario (users no tiene RLS: se filtra por id). */
export async function loadDashboardLayout(userId: string): Promise<unknown> {
  const [row] = await db
    .select({ layout: users.dashboardLayout })
    .from(users)
    .where(eq(users.id, userId));
  return row?.layout ?? null;
}
