'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db/connection';
import { users } from '@/infrastructure/db/schema';
import { getSessionUser } from '@/presentation/auth/session';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { layoutSchema } from '@/presentation/components/dashboard/widgets';

/** Guarda el orden y la visibilidad de los widgets de Inicio; `null` vuelve al diseño del rol. */
export async function saveDashboardLayoutAction(raw: unknown): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return actionRedirect('/login');
  if (user.role !== 'STORE_OWNER' && user.role !== 'STORE_EMPLOYEE') return { ok: false };

  const parsed = raw === null ? null : layoutSchema.safeParse(raw);
  if (parsed && !parsed.success) return { ok: false };

  // users no tiene RLS: el filtro por id es la frontera (igual que el idioma)
  await db
    .update(users)
    .set({ dashboardLayout: parsed ? parsed.data : null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidatePath('/');
  return { ok: true };
}
