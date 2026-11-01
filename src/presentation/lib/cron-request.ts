import { timingSafeEqual } from 'node:crypto';

type Env = { readonly [name: string]: string | undefined };

/** Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`; sin secreto no corre nada. */
export function authorizeCron(header: string | null, env: Env = process.env): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Fecha simulada para pruebas y la demo (D17): solo con `ALLOW_SIMULATED_NOW=1`
 * y nunca en producción. En cualquier otro caso, la hora real.
 */
export function resolveNow(header: string | null, env: Env = process.env, real = new Date()): Date {
  if (!header || !simulationAllowed(env)) return real;
  const simulated = new Date(header);
  return Number.isNaN(simulated.getTime()) ? real : simulated;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const simulationAllowed = (env: Env) =>
  env.VERCEL_ENV !== 'production' && env.ALLOW_SIMULATED_NOW === '1';

/**
 * `x-quina-store` acota el proceso a una tienda, con el mismo candado que la
 * fecha simulada: las pruebas e2e corren en paralelo y una fecha futura no debe
 * liquidar las tiendas de las otras pruebas.
 */
export function resolveStoreScope(
  header: string | null,
  env: Env = process.env,
): string[] | undefined {
  if (!header || !simulationAllowed(env) || !UUID.test(header)) return undefined;
  return [header];
}
