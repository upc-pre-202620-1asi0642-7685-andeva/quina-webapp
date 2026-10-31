// pnpm db:admin: crea el Administrador de Plataforma (US01) desde ADMIN_EMAIL y
// ADMIN_NAME, y muestra su enlace de un solo uso para definir la contraseña.
// Si ya existe, emite un enlace nuevo. Se conecta con DATABASE_URL (quina_app):
// users y verifications no tienen RLS.
//
// Corre con Node sin compilar, sin los alias @/: el formato del enlace repite el
// de src/infrastructure/auth/account-setup.ts (prefijo, hash SHA-256 y 72 horas).
// tests/integration/platform-admin.spec.ts comprueba que ambos sigan iguales.
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const PREFIX = 'account-setup:';
const TTL_MS = 72 * 3_600_000;

export type PlatformAdminInput = {
  url: string;
  appUrl: string;
  email: string;
  name: string;
  now?: Date;
};

export async function createPlatformAdmin(input: PlatformAdminInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL no es un correo.');
  const now = input.now ?? new Date();
  const client = postgres(input.url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await client.begin(async (tx) => {
      const [existing] = await tx<{ id: string; role: string }[]>`
        SELECT id, role FROM users WHERE email = ${email} FOR UPDATE`;
      if (existing && existing.role !== 'PLATFORM_ADMIN') {
        throw new Error(`${email} ya tiene una cuenta de tienda; usa otro correo.`);
      }
      const userId =
        existing?.id ??
        (
          await tx<{ id: string }[]>`
            INSERT INTO users (name, email, email_verified, role, store_id)
            VALUES (${input.name.trim()}, ${email}, false, 'PLATFORM_ADMIN', NULL)
            RETURNING id`
        )[0]!.id;

      const token = randomBytes(32).toString('base64url');
      const identifier = `${PREFIX}${userId}`;
      await tx`DELETE FROM verifications WHERE identifier = ${identifier}`;
      await tx`
        INSERT INTO verifications (identifier, value, expires_at)
        VALUES (${identifier}, ${createHash('sha256').update(token).digest('hex')},
                ${new Date(now.getTime() + TTL_MS)})`;
      await tx`
        INSERT INTO audit_logs (store_id, user_id, action, entity_name, entity_id, new_data)
        VALUES (NULL, ${userId}, ${existing ? 'REISSUE_ADMIN_LINK' : 'CREATE_PLATFORM_ADMIN'},
                'users', ${userId}, ${tx.json({ email, via: 'pnpm db:admin' })})`;

      const base = input.appUrl.replace(/\/+$/, '');
      return `${base}/auth/accept-invite?token=${token}`;
    });
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { DATABASE_URL, APP_URL, ADMIN_EMAIL, ADMIN_NAME } = process.env;
  if (!DATABASE_URL || !APP_URL || !ADMIN_EMAIL) {
    console.error('Faltan DATABASE_URL, APP_URL o ADMIN_EMAIL.');
    process.exit(1);
  }
  createPlatformAdmin({
    url: DATABASE_URL,
    appUrl: APP_URL,
    email: ADMIN_EMAIL,
    name: ADMIN_NAME ?? 'Administrador de Quina',
  })
    .then((link) => {
      console.log('Enlace para definir la contraseña (un solo uso, vence en 72 horas):');
      console.log(link);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
