import { defineConfig } from 'vitest/config';

// `pnpm demo:collections` (Plan 4, P8): carga datos de demostración en una tienda
// que ya existe. Usa la base de .env.local como la app (rol quina_app y RLS).
try {
  process.loadEnvFile('.env.local');
} catch {
  // Sin .env.local se usan las variables del entorno
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['scripts/demo/run.demo.ts'],
    testTimeout: 120_000,
  },
});
