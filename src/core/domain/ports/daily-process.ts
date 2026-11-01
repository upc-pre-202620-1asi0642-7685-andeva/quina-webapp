import type { Subscription } from '../billing/plan-limits';

/** Tienda activa que recorre el proceso diario (`stores` no tiene RLS). */
export type DailyStore = { id: string; subscription: Subscription };

/** Cuántas filas tocó cada paso; sirve para el resumen y las pruebas. */
export type StepCount = number;

export type DispatchResult = { sent: number; failed: number; pending: number };

/**
 * Pasos del proceso diario (docs/quina-webapp-documentation.md §11.1). Cada uno
 * corre dentro de `withTenant(storeId, …)` y es idempotente: repetirlo no
 * duplica cortes, cargos ni correos.
 */
export interface DailyProcessGateway {
  activeStores(): Promise<DailyStore[]>;
  /** US11 crit. 4: cargos `PENDING` cuyo plazo de 48 h ya pasó quedan `ACCEPTED`. */
  acceptExpiredConsents(storeId: string, now: Date): Promise<StepCount>;
  /** US10: liquida los ciclos cuyo corte ya pasó y deja en cola su estado de cuenta. */
  settleDueCycles(storeId: string, now: Date): Promise<StepCount>;
  /** US13: ciclos liquidados sin pagar después de su fecha de pago pasan a `OVERDUE`. */
  markOverdueCycles(storeId: string, now: Date, queueNotices: boolean): Promise<StepCount>;
  /** US11 crit. 2: un resumen por vecino con sus cargos sin notificar. */
  queueChargeDigests(storeId: string, now: Date): Promise<StepCount>;
  /** US12: recordatorio para los ciclos que vencen en 3 días o menos. */
  queuePaymentReminders(storeId: string, now: Date): Promise<StepCount>;
  /** Envía los correos en cola o fallidos hasta `deadline` (D10). */
  dispatchPending(storeId: string, now: Date, deadline: Date): Promise<DispatchResult>;
}
