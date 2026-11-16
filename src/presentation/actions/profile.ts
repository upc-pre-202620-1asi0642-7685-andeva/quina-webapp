'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db/connection';
import { auditLogs, stores, users } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { getSessionUser } from '@/presentation/auth/session';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { updateProfileSchema } from '@/presentation/validation/auth-schemas';

export type UpdateProfileActionState = {
  ok?: boolean;
  savedName?: string;
  savedPhone?: string | null;
  fieldErrors?: Partial<Record<'name' | 'phone', string>>;
  formError?: 'generic';
};

/**
 * Actualiza los datos personales de la sesión (`users.name` y `users.phone`).
 * Si el usuario es `STORE_OWNER`, mantiene sincronizado `stores.ownerFullName`.
 */
export async function updateProfileAction(
  _prev: UpdateProfileActionState,
  formData: FormData,
): Promise<UpdateProfileActionState> {
  const user = await getSessionUser();
  if (!user?.emailVerified) return actionRedirect('/login');

  const parsed = updateProfileSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  });

  if (!parsed.success) {
    const fieldErrors: UpdateProfileActionState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'name' || field === 'phone') {
        fieldErrors[field] ??= issue.message;
      }
    }
    return { fieldErrors };
  }

  const nextName = parsed.data.name;
  const nextPhone = parsed.data.phone;
  const reqHeaders = await headers();
  const forwarded = reqHeaders.get('x-forwarded-for');
  const ipAddress = (forwarded ? forwarded.split(',')[0]?.trim() : null)?.slice(0, 45) ?? null;
  const userAgent = reqHeaders.get('user-agent') ?? null;

  try {
    const [before] = await db
      .select({ name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, user.id));

    if (!before) return { formError: 'generic' };

    const changed = before.name !== nextName || before.phone !== nextPhone;
    if (!changed) {
      return { ok: true, savedName: nextName, savedPhone: nextPhone };
    }

    const now = new Date();
    await db
      .update(users)
      .set({ name: nextName, phone: nextPhone, updatedAt: now })
      .where(eq(users.id, user.id));

    const auditEntry = {
      storeId: user.storeId,
      userId: user.id,
      action: 'UPDATE_PROFILE',
      entityName: 'users',
      entityId: user.id,
      oldData: { name: before.name, phone: before.phone },
      newData: { name: nextName, phone: nextPhone },
      ipAddress,
      userAgent,
    };

    if (user.storeId) {
      await withTenant(user.storeId, async (tx) => {
        if (user.role === 'STORE_OWNER' && before.name !== nextName) {
          await tx
            .update(stores)
            .set({ ownerFullName: nextName, updatedAt: now })
            .where(eq(stores.id, user.storeId!));
        }
        await tx.insert(auditLogs).values(auditEntry);
      });
    } else {
      await db.insert(auditLogs).values(auditEntry);
    }
  } catch (error) {
    console.error('[profile] no se pudo actualizar los datos personales', error);
    return { formError: 'generic' };
  }

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  revalidatePath('/settings');
  revalidatePath('/team');
  return { ok: true, savedName: nextName, savedPhone: nextPhone };
}
