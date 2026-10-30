import { eq } from 'drizzle-orm';
import { AccountLockoutPolicy } from '@/core/domain/identity/account-lockout';
import type { AuthMailer } from '@/core/domain/ports/auth-mailer';
import type { Database } from '@/infrastructure/db/connection';
import { auditLogs, stores, users } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { resolveLocale } from '@/presentation/i18n/resolve-locale';

// Bloqueo tras 5 fallos (docs/quina-webapp-documentation.md §7.4). Better Auth no
// lo trae: auth.ts llama a estas funciones desde sus hooks de /sign-in/email.

/** Mensaje exacto de §7.4; la pantalla lo traduce por su código ACCOUNT_LOCKED. */
export const LOCKED_MESSAGE =
  'Cuenta temporalmente bloqueada por seguridad. Inténtalo de nuevo en 15 minutos o restablece tu contraseña.';

export const DISABLED_MESSAGE = 'Esta cuenta está desactivada.';

export type SignInGate = 'OK' | 'ACCOUNT_LOCKED' | 'ACCOUNT_DISABLED';

export type RequestMeta = { ipAddress?: string | null; userAgent?: string | null };

export type LockoutDeps = {
  db: Database;
  mailer: AuthMailer;
  now?: () => Date;
};

export function createLockout({ db, mailer, now = () => new Date() }: LockoutDeps) {
  return {
    /** Antes de verificar la contraseña: bloqueada, desactivada o tienda inactiva. */
    async gate(email: string): Promise<SignInGate> {
      const [row] = await db
        .select({
          lockedUntil: users.lockedUntil,
          isActive: users.isActive,
          storeActive: stores.isActive,
        })
        .from(users)
        .leftJoin(stores, eq(stores.id, users.storeId))
        .where(eq(users.email, email.toLowerCase()));
      // Un correo inexistente sigue el camino normal (credenciales inválidas)
      if (!row) return 'OK';
      if (AccountLockoutPolicy.isLocked(row, now())) return 'ACCOUNT_LOCKED';
      if (!row.isActive || row.storeActive === false) return 'ACCOUNT_DISABLED';
      return 'OK';
    },

    /** Contraseña equivocada de un usuario existente: suma el fallo y bloquea al 5.º. */
    async onFailure(email: string, meta: RequestMeta = {}): Promise<void> {
      const at = now();
      const outcome = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            id: users.id,
            email: users.email,
            storeId: users.storeId,
            preferredLocale: users.preferredLocale,
            failedLoginAttempts: users.failedLoginAttempts,
            lockedUntil: users.lockedUntil,
          })
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .for('update');
        if (!row) return null;
        // Otra petición lo bloqueó mientras tanto: no se toca el bloqueo vigente
        if (AccountLockoutPolicy.isLocked(row, at)) return null;
        // Un bloqueo ya vencido no arrastra sus fallos: se cuenta desde cero
        const previous = row.lockedUntil === null ? row.failedLoginAttempts : 0;
        const next = AccountLockoutPolicy.onFailure({ failedAttempts: previous }, at);
        await tx
          .update(users)
          .set({
            failedLoginAttempts: next.failedAttempts,
            lockedUntil: next.lockedUntil,
            updatedAt: at,
          })
          .where(eq(users.id, row.id));
        return { row, next };
      });
      if (!outcome?.next.justLocked) return;

      const { row, next } = outcome;
      const audit = {
        storeId: row.storeId,
        userId: row.id,
        action: 'LOCK_ACCOUNT',
        entityName: 'users',
        entityId: row.id,
        newData: {
          failedLoginAttempts: next.failedAttempts,
          lockedUntil: next.lockedUntil?.toISOString() ?? null,
        },
        ipAddress: meta.ipAddress?.slice(0, 45) ?? null,
        userAgent: meta.userAgent ?? null,
      };
      // audit_logs es de solo inserción y con RLS: sin .returning()
      if (row.storeId) {
        await withTenant(row.storeId, (tx) => tx.insert(auditLogs).values(audit), db);
      } else {
        await db.insert(auditLogs).values(audit);
      }

      try {
        await mailer.sendLockoutAlert({
          to: row.email,
          locale: resolveLocale({ userPreference: row.preferredLocale }),
        });
      } catch (error) {
        // El aviso es preventivo: si el correo falla, el bloqueo ya quedó guardado
        console.error('No se pudo enviar el aviso de bloqueo', error);
      }
    },

    /** Ingreso correcto: contador a 0, sin bloqueo y fecha del último ingreso. */
    async onSuccess(userId: string): Promise<void> {
      const at = now();
      await db
        .update(users)
        .set({ ...toColumns(AccountLockoutPolicy.onSuccess()), lastLoginAt: at, updatedAt: at })
        .where(eq(users.id, userId));
    },

    /** Contraseña restablecida: la cuenta vuelve a quedar libre. */
    async onPasswordReset(userId: string): Promise<void> {
      await db
        .update(users)
        .set({ ...toColumns(AccountLockoutPolicy.onSuccess()), updatedAt: now() })
        .where(eq(users.id, userId));
    },
  };
}

export type Lockout = ReturnType<typeof createLockout>;

function toColumns(state: { failedAttempts: number; lockedUntil: Date | null }) {
  return { failedLoginAttempts: state.failedAttempts, lockedUntil: state.lockedUntil };
}
