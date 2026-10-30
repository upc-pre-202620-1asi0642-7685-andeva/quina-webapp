// pnpm db:roles: activa LOGIN y fija la contraseña de quina_app y quina_platform.
// La migración 0001 crea los roles NOLOGIN y sin contraseña; las contraseñas
// nunca se guardan en el repositorio, salen de .env.local o del entorno.
// Conexión: DB_ROLES_URL o, si no existe, DATABASE_MIGRATION_URL (rol que migra).
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

export type RolePasswords = {
  url: string;
  appPassword: string;
  platformPassword: string;
};

// ALTER ROLE no acepta parámetros, así que PostgreSQL arma la sentencia con
// format('%I', '%L') a partir de parámetros y luego se ejecuta tal cual.
// Si falla, el error se reemplaza por uno sin la sentencia (lleva la contraseña).
export async function applyRolePasswords({
  url,
  appPassword,
  platformPassword,
}: RolePasswords): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const [role, password] of [
      ['quina_app', appPassword],
      ['quina_platform', platformPassword],
    ] as const) {
      try {
        const [row] = await client<{ statement: string }[]>`
          SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', ${role}::text, ${password}::text) AS statement`;
        await client.unsafe(row!.statement);
      } catch (error) {
        const { code, message } = error as { code?: string; message?: string };
        throw new Error(
          `No se pudo configurar el rol ${role} (${code ?? 'sin código'}): ${message}`,
        );
      }
    }
  } finally {
    await client.end();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const url = process.env.DB_ROLES_URL || process.env.DATABASE_MIGRATION_URL;
  if (!url) {
    throw new Error('Falta la variable de entorno DB_ROLES_URL o DATABASE_MIGRATION_URL.');
  }
  await applyRolePasswords({
    url,
    appPassword: requireEnv('QUINA_APP_DB_PASSWORD'),
    platformPassword: requireEnv('QUINA_PLATFORM_DB_PASSWORD'),
  });
  console.log('Roles quina_app y quina_platform listos (LOGIN y contraseña aplicados).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Error desconocido.');
    process.exit(1);
  });
}
