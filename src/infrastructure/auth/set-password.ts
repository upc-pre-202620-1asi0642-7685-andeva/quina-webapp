import { APIError } from 'better-auth/api';
import type { Database } from '@/infrastructure/db/connection';
import { auditLogs } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import type { Auth } from './auth';

export type SetOwnPasswordInput = {
  /** Cabeceras de la petición: llevan la cookie de sesión del dueño. */
  headers: Headers;
  newPassword: string;
  userId: string;
  storeId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
};

export type SetOwnPasswordResult = 'OK' | 'PASSWORD_ALREADY_SET';

/**
 * Crea la contraseña de una cuenta que entró con Google (US02). Better Auth la
 * guarda como cuenta `credential` con Argon2id; si ya existe, no la reemplaza:
 * para cambiarla está la recuperación por correo.
 */
export async function setOwnPassword(
  deps: { auth: Auth; db: Database },
  input: SetOwnPasswordInput,
): Promise<SetOwnPasswordResult> {
  try {
    await deps.auth.api.setPassword({
      body: { newPassword: input.newPassword },
      headers: input.headers,
    });
  } catch (error) {
    if (
      error instanceof APIError &&
      (error.body as { code?: string })?.code === 'PASSWORD_ALREADY_SET'
    ) {
      return 'PASSWORD_ALREADY_SET';
    }
    throw error;
  }

  // audit_logs es de solo inserción y con RLS: sin .returning()
  await withTenant(
    input.storeId,
    (tx) =>
      tx.insert(auditLogs).values({
        storeId: input.storeId,
        userId: input.userId,
        action: 'SET_PASSWORD',
        entityName: 'users',
        entityId: input.userId,
        newData: { provider: 'credential' },
        ipAddress: input.ip?.slice(0, 45) ?? null,
        userAgent: input.userAgent ?? null,
      }),
    deps.db,
  );
  return 'OK';
}
