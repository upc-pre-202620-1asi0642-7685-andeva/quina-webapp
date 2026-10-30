// Conexiones de las pruebas de integración. Sin variables de entorno se usa el
// PostgreSQL local de compose.yaml (`docker compose up -d`). Son getters para
// leer process.env en el momento de uso (después de cargar .env.local).
export const testEnv = {
  // Rol que migra y limpia (migrator en local, postgres en Supabase)
  get ownerUrl(): string {
    return (
      process.env.DATABASE_TEST_URL ?? 'postgres://migrator:migrator@localhost:54329/quina_test'
    );
  },
  // Rol de la aplicación: no salta RLS
  get appUrl(): string {
    return (
      process.env.DATABASE_TEST_APP_URL ??
      'postgres://quina_app:quina_app_test@localhost:54329/quina_test'
    );
  },
  get appPassword(): string {
    return process.env.QUINA_APP_DB_PASSWORD ?? 'quina_app_test';
  },
  get platformPassword(): string {
    return process.env.QUINA_PLATFORM_DB_PASSWORD ?? 'quina_platform_test';
  },
};
