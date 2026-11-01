import { createHash, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { PortalCodes } from '@/core/domain/ports/portal-directory';
import type { Database } from '@/infrastructure/db/connection';
import { verifications } from '@/infrastructure/db/schema';

// Mismo formato que el plugin emailOTP con storeOTP 'hashed' (better-auth 1.7):
// identifier `sign-in-otp-<correo>` y value `<sha256 base64url>:<intentos>`.
// tests/integration/portal.spec.ts falla si una actualización lo cambia.
const identifierOf = (email: string) => `sign-in-otp-${email}`;
const hashOf = (code: string) => createHash('sha256').update(code).digest('base64url');
const ALLOWED_ATTEMPTS = 5;

function splitValue(value: string): [string, number] {
  const idx = value.lastIndexOf(':');
  return idx === -1 ? [value, 0] : [value.slice(0, idx), Number(value.slice(idx + 1)) || 0];
}

/** Códigos del portal sobre la tabla `verifications` de Better Auth (Plan 5, D4 y D6). */
export function createPortalCodes(deps: {
  db: Database;
  send: (email: string) => Promise<void>;
  now?: () => Date;
}): PortalCodes {
  const now = deps.now ?? (() => new Date());

  // Better Auth solo mira la fila más reciente de cada correo (findVerificationValue)
  async function live(emails: readonly string[]) {
    if (emails.length === 0) return [];
    const rows = await deps.db
      .select()
      .from(verifications)
      .where(
        and(
          inArray(verifications.identifier, emails.map(identifierOf)),
          gt(verifications.expiresAt, now()),
        ),
      )
      .orderBy(desc(verifications.createdAt));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!latest.has(row.identifier)) latest.set(row.identifier, row);
    return [...latest.values()];
  }

  return {
    async lastSentAt(email) {
      const [row] = await live([email]);
      return row ? row.createdAt : null;
    },
    send: deps.send,
    async emailForCode(emails, code) {
      const expected = Buffer.from(hashOf(code));
      for (const row of await live(emails)) {
        const [stored, attempts] = splitValue(row.value);
        if (attempts >= ALLOWED_ATTEMPTS) continue;
        const actual = Buffer.from(stored);
        if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
          return row.identifier.slice('sign-in-otp-'.length);
        }
      }
      return null;
    },
    async recordFailure(emails) {
      for (const row of await live(emails)) {
        const [stored, attempts] = splitValue(row.value);
        await deps.db
          .update(verifications)
          .set({ value: `${stored}:${attempts + 1}`, updatedAt: now() })
          .where(eq(verifications.id, row.id));
      }
    },
  };
}
