// Protege contra borrar una base real: el setup de integración hace
// DROP SCHEMA public CASCADE, así que solo se permite en bases cuyo nombre
// contenga "test", salvo que QUINA_ALLOW_DB_RESET=1 lo autorice explícitamente.
export function assertResettableDatabase(
  databaseName: string,
  env: Record<string, string | undefined>,
): void {
  if (/test/i.test(databaseName) || env.QUINA_ALLOW_DB_RESET === '1') {
    return;
  }
  throw new Error(
    `La base "${databaseName}" no parece de pruebas: el setup no la borrará. ` +
      'Usa una base cuyo nombre contenga "test" o define QUINA_ALLOW_DB_RESET=1.',
  );
}
