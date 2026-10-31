import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, like } from 'drizzle-orm';
import { PasswordPolicy } from '@/core/domain/identity/password-policy';
import {
  ACCOUNT_SETUP_TTL_HOURS,
  type AccountSetupTokens,
} from '@/core/domain/ports/account-setup';
import type { Database } from '@/infrastructure/db/connection';
import { db as defaultDb } from '@/infrastructure/db/connection';
import { ACCOUNT_SETUP_PREFIX } from '@/infrastructure/db/repositories/drizzle-team-repository';
import { auditLogs, stores, users, verifications } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import type { Auth } from './auth';

// En la base solo queda el hash: quien lea la tabla no puede usar el enlace
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export class DrizzleAccountSetupTokens implements AccountSetupTokens {
  constructor(private readonly database: Database = defaultDb) {}

  async issue(userId: string, now: Date): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const identifier = `${ACCOUNT_SETUP_PREFIX}${userId}`;
    await this.database.transaction(async (tx) => {
      await tx.delete(verifications).where(eq(verifications.identifier, identifier));
      await tx.insert(verifications).values({
        identifier,
        value: digest(token),
        expiresAt: new Date(now.getTime() + ACCOUNT_SETUP_TTL_HOURS * 3_600_000),
      });
    });
    return token;
  }
}

export type AccountSetupInvite = {
  userId: string;
  name: string;
  email: string;
  storeName: string | null;
};

/** Enlace vigente: muestra a quién se le define la contraseña. */
export async function readAccountSetup(
  token: string,
  now: Date,
  database: Database = defaultDb,
): Promise<AccountSetupInvite | null> {
  if (!token) return null;
  const [link] = await database
    .select({ identifier: verifications.identifier })
    .from(verifications)
    .where(
      and(
        eq(verifications.value, digest(token)),
        like(verifications.identifier, `${ACCOUNT_SETUP_PREFIX}%`),
        gt(verifications.expiresAt, now),
      ),
    );
  if (!link) return null;
  const [row] = await database
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      storeName: stores.commercialName,
      storeActive: stores.isActive,
    })
    .from(users)
    .leftJoin(stores, eq(stores.id, users.storeId))
    .where(eq(users.id, link.identifier.slice(ACCOUNT_SETUP_PREFIX.length)));
  if (!row || !row.isActive || row.storeActive === false) return null;
  return { userId: row.userId, name: row.name, email: row.email, storeName: row.storeName };
}

export type RedeemResult = 'OK' | 'INVALID' | 'PASSWORD_WEAK';

/**
 * Canjea el enlace una sola vez: crea la cuenta `credential` con el hash de
 * Better Auth (Argon2id), marca el correo como verificado y deja auditoría.
 */
export async function redeemAccountSetup(
  deps: { auth: Auth; db?: Database },
  input: { token: string; password: string; now: Date; ip: string; userAgent: string },
): Promise<RedeemResult> {
  const database = deps.db ?? defaultDb;
  if (!PasswordPolicy.check(input.password).ok) return 'PASSWORD_WEAK';
  const invite = await readAccountSetup(input.token, input.now, database);
  if (!invite) return 'INVALID';

  // Reclamo atómico: de dos envíos a la vez, solo uno borra la fila
  const claimed = await database
    .delete(verifications)
    .where(
      and(
        eq(verifications.identifier, `${ACCOUNT_SETUP_PREFIX}${invite.userId}`),
        eq(verifications.value, digest(input.token)),
      ),
    )
    .returning({ id: verifications.id });
  if (claimed.length === 0) return 'INVALID';

  const context = await deps.auth.$context;
  if (await context.internalAdapter.findCredentialAccount(invite.userId)) return 'INVALID';
  await context.internalAdapter.linkAccount({
    userId: invite.userId,
    providerId: 'credential',
    accountId: invite.userId,
    password: await context.password.hash(input.password),
  });

  const [user] = await database
    .update(users)
    .set({ emailVerified: true, updatedAt: input.now })
    .where(eq(users.id, invite.userId))
    .returning({ storeId: users.storeId });
  const audit = {
    storeId: user?.storeId ?? null,
    userId: invite.userId,
    action: 'SET_PASSWORD',
    entityName: 'users',
    entityId: invite.userId,
    newData: { provider: 'credential', via: 'account-setup' },
    ipAddress: input.ip.slice(0, 45),
    userAgent: input.userAgent,
  };
  if (audit.storeId) {
    const storeId = audit.storeId;
    await withTenant(storeId, (tx) => tx.insert(auditLogs).values(audit), database);
  } else {
    await database.insert(auditLogs).values(audit);
  }
  return 'OK';
}
