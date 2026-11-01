'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { NOTE_MAX, ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import { PlanLimits } from '@/core/domain/billing/plan-limits';
import { DrizzleChargeResolutionRepository } from '@/infrastructure/db/collections/drizzle-charge-resolution-repository';
import {
  queueChargeDigests,
  queuePaymentReminders,
} from '@/infrastructure/db/collections/drizzle-daily-process';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import { authorizeStore } from '@/presentation/auth/guards';
import { loadStoreContext } from '@/presentation/queries/store-context';

const chargeSchema = z.object({
  customerId: z.uuid(),
  cycleId: z.uuid(),
  chargeId: z.uuid(),
  note: z.string().max(NOTE_MAX * 2),
});

export type ChargeInput = z.input<typeof chargeSchema>;

export type ChargeActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'SESSION'
        | 'INVALID'
        | 'GENERIC'
        | 'NOTE_REQUIRED'
        | 'CHARGE_NOT_FOUND'
        | 'CHARGE_NOT_PENDING'
        | 'OBJECTION_WINDOW_CLOSED'
        | 'CHARGE_NOT_OBJECTED'
        | 'CHARGE_ALREADY_VOIDED'
        | 'CHARGE_HAS_PAYMENTS'
        | 'INSTALLMENT_ALREADY_BILLED';
    };

const resolver = () => new ResolveChargeUseCase(new DrizzleChargeResolutionRepository());

function refresh(input: { customerId: string; cycleId: string }) {
  revalidatePath(`/customers/${input.customerId}/cycles/${input.cycleId}`);
  revalidatePath(`/customers/${input.customerId}`);
  revalidatePath('/collections');
  revalidatePath('/inventory');
}

/** US11 crit. 4 (P4): el dueño o el empleado registran lo que el vecino reportó. */
export async function objectChargeAction(input: ChargeInput): Promise<ChargeActionResult> {
  const user = await authorizeStore('charges.object');
  if (!user) return { ok: false, error: 'SESSION' };
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  try {
    const result = await resolver().object({
      storeId: user.storeId,
      chargeId: parsed.data.chargeId,
      userId: user.id,
      note: parsed.data.note,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: result.error };
    refresh(parsed.data);
    return { ok: true };
  } catch (error) {
    console.error('objectChargeAction', error);
    return { ok: false, error: 'GENERIC' };
  }
}

/** US11 crit. 7: solo el dueño confirma un cargo observado. */
export async function confirmChargeAction(input: ChargeInput): Promise<ChargeActionResult> {
  const user = await authorizeStore('charges.resolve');
  if (!user) return { ok: false, error: 'SESSION' };
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  try {
    const result = await resolver().confirm({
      storeId: user.storeId,
      chargeId: parsed.data.chargeId,
      userId: user.id,
      note: parsed.data.note,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: result.error };
    refresh(parsed.data);
    return { ok: true };
  } catch (error) {
    console.error('confirmChargeAction', error);
    return { ok: false, error: 'GENERIC' };
  }
}

/** US11 crit. 7: solo el dueño anula; el stock vuelve y la deuda baja. */
export async function voidChargeAction(input: ChargeInput): Promise<ChargeActionResult> {
  const user = await authorizeStore('charges.resolve');
  if (!user) return { ok: false, error: 'SESSION' };
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  try {
    const result = await resolver().void({
      storeId: user.storeId,
      chargeId: parsed.data.chargeId,
      userId: user.id,
      reason: parsed.data.note,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: result.error };
    refresh(parsed.data);
    return { ok: true };
  } catch (error) {
    console.error('voidChargeAction', error);
    return { ok: false, error: 'GENERIC' };
  }
}

export type ManualNoticeResult =
  | { ok: true; queued: number; sent: number; failed: number }
  | { ok: false; error: 'SESSION' | 'AUTOMATIC' | 'GENERIC' };

const MANUAL_BUDGET_MS = 20_000;

/**
 * P5: en el Plan Casero el resumen de cargos y los recordatorios salen con un
 * botón. En Pro y Plus los manda el proceso diario, así que el botón no aplica.
 */
async function sendManual(kind: 'digest' | 'reminder', label: string): Promise<ManualNoticeResult> {
  const user = await authorizeStore('notifications.send');
  if (!user) return { ok: false, error: 'SESSION' };
  try {
    const store = await loadStoreContext(user.storeId);
    if (PlanLimits.of(store.tier).features.automaticNotifications) {
      return { ok: false, error: 'AUTOMATIC' };
    }
    const now = new Date();
    const queued =
      kind === 'digest'
        ? await queueChargeDigests(user.storeId, now, now)
        : await queuePaymentReminders(user.storeId, now);
    const result = await new NotificationDispatcher().dispatchStore(
      user.storeId,
      now,
      new Date(now.getTime() + MANUAL_BUDGET_MS),
    );
    revalidatePath('/collections');
    return { ok: true, queued, sent: result.sent, failed: result.failed };
  } catch (error) {
    console.error(label, error);
    return { ok: false, error: 'GENERIC' };
  }
}

/** US11 crit. 2 en Casero: "Enviar resumen de cargos". */
export async function sendChargeDigestsAction(): Promise<ManualNoticeResult> {
  return sendManual('digest', 'sendChargeDigestsAction');
}

/** US12 en Casero: "Enviar recordatorios". */
export async function sendPaymentRemindersAction(): Promise<ManualNoticeResult> {
  return sendManual('reminder', 'sendPaymentRemindersAction');
}
