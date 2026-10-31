import { and, count, eq, sql } from 'drizzle-orm';
import type { PlanTier, Subscription, SubscriptionStatus } from '@/core/domain/billing/plan-limits';
import type {
  InviteData,
  MemberData,
  SeatGuard,
  TeamRepository,
} from '@/core/domain/ports/team-repository';
import type { Database } from '../connection';
import { db } from '../connection';
import { uniqueViolation } from '../errors';
import { auditLogs, sessions, storeSubscriptions, users, verifications } from '../schema';
import { withTenant, type Tx } from '../with-tenant';

/** Prefijo de `verifications.identifier` para los enlaces de cuenta. */
export const ACCOUNT_SETUP_PREFIX = 'account-setup:';

// users no tiene RLS: cada consulta filtra por la tienda de la sesión
const employeeOf = (storeId: string, userId: string) =>
  and(eq(users.id, userId), eq(users.storeId, storeId), eq(users.role, 'STORE_EMPLOYEE'));

/**
 * ¿Ya definió su contraseña? Drizzle escribe las columnas sin tabla dentro de una
 * subconsulta, así que la referencia a users va calificada a mano.
 */
export const HAS_PASSWORD = sql<boolean>`exists (select 1 from accounts credential where credential.user_id = "users"."id" and credential.provider_id = 'credential')`;

export const WITHOUT_PASSWORD = sql`not ${HAS_PASSWORD}`;

/**
 * Bloquea la suscripción (FOR UPDATE) y cuenta los usuarios activos de la tienda,
 * dueño e invitados incluidos (D4): dos invitaciones a la vez no pasan el límite.
 */
async function hasSeat(tx: Tx, storeId: string, canAdd: SeatGuard): Promise<boolean> {
  const [subscription] = await tx
    .select({
      planTier: storeSubscriptions.planTier,
      status: storeSubscriptions.status,
      trialEndsAt: storeSubscriptions.trialEndsAt,
    })
    .from(storeSubscriptions)
    .where(eq(storeSubscriptions.storeId, storeId))
    .for('update');
  if (!subscription) return false;
  const [seats] = await tx
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.storeId, storeId), eq(users.isActive, true)));
  const current: Subscription = {
    planTier: subscription.planTier as PlanTier,
    status: subscription.status as SubscriptionStatus,
    trialEndsAt: subscription.trialEndsAt,
  };
  return canAdd(current, seats?.total ?? 0);
}

export class DrizzleTeamRepository implements TeamRepository {
  constructor(private readonly database: Database = db) {}

  async invite(
    data: InviteData,
  ): Promise<{ userId: string } | 'EMAIL_TAKEN' | 'PLAN_LIMIT_REACHED'> {
    try {
      return await withTenant(
        data.storeId,
        async (tx) => {
          if (!(await hasSeat(tx, data.storeId, data.canAdd))) return 'PLAN_LIMIT_REACHED';
          const [created] = await tx
            .insert(users)
            .values({
              name: data.name,
              email: data.email,
              emailVerified: false,
              role: 'STORE_EMPLOYEE',
              storeId: data.storeId,
              preferredLocale: data.locale,
            })
            .returning({ id: users.id });
          const userId = created!.id;
          await tx.insert(auditLogs).values({
            storeId: data.storeId,
            userId: data.actorId,
            action: 'INVITE_EMPLOYEE',
            entityName: 'users',
            entityId: userId,
            newData: { name: data.name, email: data.email },
          });
          return { userId };
        },
        this.database,
      );
    } catch (error) {
      // Decisión 2: un correo con cuenta (en esta u otra tienda) no se invita
      if (uniqueViolation(error)) return 'EMAIL_TAKEN';
      throw error;
    }
  }

  async findInvited(storeId: string, userId: string) {
    const [row] = await this.database
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(and(employeeOf(storeId, userId), eq(users.isActive, true), WITHOUT_PASSWORD));
    return row ?? null;
  }

  async cancelInvite(data: MemberData): Promise<'OK' | 'NOT_FOUND'> {
    return withTenant(
      data.storeId,
      async (tx) => {
        const removed = await tx
          .delete(users)
          .where(and(employeeOf(data.storeId, data.userId), WITHOUT_PASSWORD))
          .returning({ email: users.email });
        if (removed.length === 0) return 'NOT_FOUND';
        await tx
          .delete(verifications)
          .where(eq(verifications.identifier, `${ACCOUNT_SETUP_PREFIX}${data.userId}`));
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'CANCEL_INVITE',
          entityName: 'users',
          entityId: data.userId,
          oldData: { email: removed[0]!.email },
        });
        return 'OK';
      },
      this.database,
    );
  }

  async setActive(
    data: MemberData & { active: boolean; canAdd: SeatGuard },
  ): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'> {
    return withTenant(
      data.storeId,
      async (tx) => {
        const [member] = await tx
          .select({ isActive: users.isActive })
          .from(users)
          .where(employeeOf(data.storeId, data.userId))
          .for('update');
        if (!member) return 'NOT_FOUND';
        if (member.isActive === data.active) return 'OK';
        if (data.active && !(await hasSeat(tx, data.storeId, data.canAdd))) {
          return 'PLAN_LIMIT_REACHED';
        }
        await tx
          .update(users)
          .set({ isActive: data.active, updatedAt: data.now })
          .where(eq(users.id, data.userId));
        // US05: el empleado desactivado sale de inmediato de todos sus equipos
        if (!data.active) {
          await tx.delete(sessions).where(eq(sessions.userId, data.userId));
        }
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: data.active ? 'REACTIVATE_EMPLOYEE' : 'DEACTIVATE_EMPLOYEE',
          entityName: 'users',
          entityId: data.userId,
          oldData: { isActive: member.isActive },
          newData: { isActive: data.active },
        });
        return 'OK';
      },
      this.database,
    );
  }
}
