import type { Subscription } from '../billing/plan-limits';
import type { Locale } from '../shared/locale';

/**
 * D4: invitado = activo sin contraseña; activo = ya definió su contraseña;
 * desactivado = `is_active` en falso.
 */
export type TeamMemberStatus = 'INVITED' | 'ACTIVE' | 'DEACTIVATED';

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: 'STORE_OWNER' | 'STORE_EMPLOYEE';
  status: TeamMemberStatus;
};

/** ¿Cabe uno más? `seats` ya cuenta al dueño y a los invitados (US26.2). */
export type SeatGuard = (subscription: Subscription, seats: number) => boolean;

export type InviteData = {
  storeId: string;
  actorId: string;
  name: string;
  email: string;
  locale: Locale;
  canAdd: SeatGuard;
  now: Date;
};

export type MemberData = { storeId: string; actorId: string; userId: string; now: Date };

export interface TeamRepository {
  /** Crea al empleado invitado y su auditoría; bloquea la suscripción al contar. */
  invite(data: InviteData): Promise<{ userId: string } | 'EMAIL_TAKEN' | 'PLAN_LIMIT_REACHED'>;
  /** Solo empleados de la tienda que aún no definen su contraseña. */
  findInvited(storeId: string, userId: string): Promise<{ name: string; email: string } | null>;
  /** Borra al invitado (nunca operó) y sus enlaces. */
  cancelInvite(data: MemberData): Promise<'OK' | 'NOT_FOUND'>;
  /** Desactivar cierra sus sesiones; reactivar vuelve a contar en el límite. */
  setActive(
    data: MemberData & { active: boolean; canAdd: SeatGuard },
  ): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'>;
}
