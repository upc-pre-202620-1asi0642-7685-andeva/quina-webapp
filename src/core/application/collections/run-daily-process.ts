import { PlanLimits } from '@/core/domain/billing/plan-limits';
import type {
  DailyProcessGateway,
  DailyStore,
  DispatchResult,
} from '@/core/domain/ports/daily-process';

export type DailyStepName = 'consent' | 'cutoff' | 'overdue' | 'digest' | 'reminder';

export type DailyProcessSummary = {
  stores: number;
  steps: Record<DailyStepName, number>;
  mail: DispatchResult;
  errors: { storeId: string; step: DailyStepName | 'dispatch'; message: string }[];
};

type DailyStep = {
  name: DailyStepName;
  /** Solo en planes con avisos automáticos (US26 crit. 6, decisión P5). */
  automaticOnly: boolean;
  run: (
    gateway: DailyProcessGateway,
    storeId: string,
    now: Date,
    automatic: boolean,
  ) => Promise<number>;
};

/**
 * Registro de pasos en el orden de D1b: la mora corre antes que el
 * recordatorio, así nunca sale un aviso preventivo de una deuda vencida. Cada
 * rebanada agrega su paso aquí sin tocar la ruta del cron.
 */
const STEPS: readonly DailyStep[] = [
  { name: 'consent', automaticOnly: false, run: (g, id, now) => g.acceptExpiredConsents(id, now) },
  { name: 'cutoff', automaticOnly: false, run: (g, id, now) => g.settleDueCycles(id, now) },
  {
    name: 'overdue',
    automaticOnly: false,
    run: (g, id, now, automatic) => g.markOverdueCycles(id, now, automatic),
  },
  { name: 'digest', automaticOnly: true, run: (g, id, now) => g.queueChargeDigests(id, now) },
  { name: 'reminder', automaticOnly: true, run: (g, id, now) => g.queuePaymentReminders(id, now) },
];

/**
 * Proceso diario único (docs §11.1): primero los pasos de datos de todas las
 * tiendas y al final los envíos, que se detienen al agotar el tiempo (D10b);
 * lo pendiente sale en la siguiente corrida. El error de una tienda no frena a
 * las demás.
 */
export class RunDailyProcessUseCase {
  constructor(private readonly gateway: DailyProcessGateway) {}

  async execute(command: { now: Date; budgetMs: number }): Promise<DailyProcessSummary> {
    const { now } = command;
    const deadline = new Date(Date.now() + command.budgetMs);
    const stores = await this.gateway.activeStores();
    const summary: DailyProcessSummary = {
      stores: stores.length,
      steps: { consent: 0, cutoff: 0, overdue: 0, digest: 0, reminder: 0 },
      mail: { sent: 0, failed: 0, pending: 0 },
      errors: [],
    };

    for (const store of stores) {
      const automatic = isAutomatic(store, now);
      for (const step of STEPS) {
        if (step.automaticOnly && !automatic) continue;
        try {
          summary.steps[step.name] += await step.run(this.gateway, store.id, now, automatic);
        } catch (error) {
          summary.errors.push({ storeId: store.id, step: step.name, message: messageOf(error) });
        }
      }
    }

    for (const store of stores) {
      try {
        const result = await this.gateway.dispatchPending(store.id, now, deadline);
        summary.mail.sent += result.sent;
        summary.mail.failed += result.failed;
        summary.mail.pending += result.pending;
      } catch (error) {
        summary.errors.push({ storeId: store.id, step: 'dispatch', message: messageOf(error) });
      }
    }
    return summary;
  }
}

function isAutomatic(store: DailyStore, now: Date): boolean {
  return PlanLimits.of(PlanLimits.effectiveTier(store.subscription, now)).features
    .automaticNotifications;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
