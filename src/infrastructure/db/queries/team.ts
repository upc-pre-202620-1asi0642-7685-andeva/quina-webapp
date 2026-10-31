import { asc, eq, sql } from 'drizzle-orm';
import type { TeamMember } from '@/core/domain/ports/team-repository';
import { db } from '../connection';
import { HAS_PASSWORD } from '../repositories/drizzle-team-repository';
import { users } from '../schema';

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
    })
    .from(users)
    .where(eq(users.storeId, storeId))
    .orderBy(sql`${users.role} = 'STORE_OWNER' desc`, asc(users.name));
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role as TeamMember['role'],
    status: !row.isActive ? 'DEACTIVATED' : row.hasPassword ? 'ACTIVE' : 'INVITED',
  }));
}
