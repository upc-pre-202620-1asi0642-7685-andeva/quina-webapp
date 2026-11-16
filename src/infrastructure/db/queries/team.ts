import { asc, eq, sql } from 'drizzle-orm';
import type { TeamMember } from '@/core/domain/ports/team-repository';
import { db } from '../connection';
import { ACCOUNT_SETUP_PREFIX, HAS_PASSWORD } from '../repositories/drizzle-team-repository';
import { users, verifications } from '../schema';

/** Equipo de la tienda: el dueño primero. users no tiene RLS, se filtra por tienda. */
export async function listTeam(storeId: string): Promise<TeamMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      hasPassword: HAS_PASSWORD,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      inviteExpiresAt: verifications.expiresAt,
    })
    .from(users)
    .leftJoin(
      verifications,
      eq(verifications.identifier, sql`${ACCOUNT_SETUP_PREFIX}::text || ${users.id}::text`),
    )
    .where(eq(users.storeId, storeId))
    .orderBy(sql`${users.role} = 'STORE_OWNER' desc`, asc(users.name));
  return rows.map((row) => {
    const status: TeamMember['status'] = !row.isActive
      ? 'DEACTIVATED'
      : row.hasPassword
        ? 'ACTIVE'
        : 'INVITED';
    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role as TeamMember['role'],
      status,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
      inviteExpiresAt: status === 'INVITED' ? row.inviteExpiresAt : null,
    };
  });
}
