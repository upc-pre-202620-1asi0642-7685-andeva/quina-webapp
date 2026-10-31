import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/integration/env';

// Pruebas contra un PostgreSQL real (`pnpm test:db`). Sin variables de entorno usa
// la base local de compose.yaml. Los archivos corren uno tras otro porque
// comparten la base y el setup la borra y la vuelve a migrar.
try {
  process.loadEnvFile('.env.local');
} catch {
  // Sin .env.local se usan los valores por defecto de tests/integration/env.ts
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.spec.ts'],
    fileParallelism: false,
    globalSetup: ['tests/integration/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // La aplicación (db, withTenant) se conecta como quina_app a la base de pruebas
    // y como quina_platform solo para los topes del BCRP
    env: { DATABASE_URL: testEnv.appUrl, DATABASE_PLATFORM_URL: testEnv.platformUrl },
  },
});
