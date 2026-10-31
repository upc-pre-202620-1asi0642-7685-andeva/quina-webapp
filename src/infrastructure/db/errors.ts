// Drizzle envuelve el error de PostgreSQL; SQLSTATE y restricción quedan en `cause`.
export function uniqueViolation(error: unknown): string | undefined {
  const pg = ((error as { cause?: unknown }).cause ?? error) as {
    code?: string;
    constraint_name?: string;
  };
  return pg.code === '23505' ? (pg.constraint_name ?? '') : undefined;
}
