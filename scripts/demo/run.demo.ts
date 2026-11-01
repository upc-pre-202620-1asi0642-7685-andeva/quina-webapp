// Lanzador de `pnpm demo:collections`. Corre con Vitest solo porque así se
// resuelven los alias @/ y se carga .env.local sin otra herramienta; no es una
// prueba y no está en `pnpm test` ni en `pnpm test:db`.
import { afterAll, it } from 'vitest';
import { closeDb } from '@/infrastructure/db/connection';
import { runDemo } from './demo-collections';

afterAll(async () => {
  await closeDb();
});

it('carga los datos de la demo de cobranza', async () => {
  const { summary, cycles } = await runDemo(process.env);
  // Directo a stdout: Vitest oculta la consola de lo que pasa
  process.stdout.write(`${JSON.stringify({ summary, cycles }, null, 2)}\n`);
}, 120_000);
