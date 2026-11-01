import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import { DrizzleDailyProcess } from '@/infrastructure/db/collections/drizzle-daily-process';
import { authorizeCron, resolveNow, resolveStoreScope } from '@/presentation/lib/cron-request';

// Vercel Hobby con Fluid compute: el proceso deja margen para cerrar antes del límite (D10b)
export const maxDuration = 60;
const BUDGET_MS = 50_000;

/**
 * Proceso diario único (docs §11.1): Vercel Cron lo llama a las 11:00 UTC
 * (06:00 en Lima) con `Authorization: Bearer CRON_SECRET`. Fuera de producción
 * acepta `x-quina-now` para simular la fecha (D17).
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorizeCron(request.headers.get('authorization'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const now = resolveNow(request.headers.get('x-quina-now'));
  const storeIds = resolveStoreScope(request.headers.get('x-quina-store'));
  const summary = await new RunDailyProcessUseCase(
    new DrizzleDailyProcess(undefined, { storeIds }),
  ).execute({
    now,
    budgetMs: BUDGET_MS,
  });
  return Response.json({ now: now.toISOString(), ...summary });
}
