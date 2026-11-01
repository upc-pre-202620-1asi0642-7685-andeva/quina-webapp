'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { RegisterPaymentUseCase } from '@/core/application/collections/register-payment';
import { DEBT_PAYMENT_METHODS, type PaymentError } from '@/core/domain/ports/payment-repository';
import { DrizzlePaymentRepository } from '@/infrastructure/db/collections/drizzle-payment-repository';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import { authorizeStore } from '@/presentation/auth/guards';

const paymentSchema = z.object({
  customerId: z.uuid(),
  cycleId: z.uuid(),
  amount: z.string().max(20),
  method: z.enum(DEBT_PAYMENT_METHODS),
  amountReceived: z.string().max(20),
});

export type PaymentInput = z.input<typeof paymentSchema>;

export type PaymentActionResult =
  | { ok: true; paymentId: string; receiptNumber: string; changeGiven: string | null }
  | { ok: false; error: 'SESSION' | 'INVALID' | 'GENERIC' | PaymentError };

/** US13: el dueño o el empleado cobran el ciclo completo; el cobrador sale de la sesión. */
export async function registerPaymentAction(input: PaymentInput): Promise<PaymentActionResult> {
  const user = await authorizeStore('payments.create');
  if (!user) return { ok: false, error: 'SESSION' };
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };

  try {
    const dispatcher = new NotificationDispatcher();
    const result = await new RegisterPaymentUseCase(
      new DrizzlePaymentRepository(),
      (storeId, logId) => dispatcher.dispatchOne(storeId, logId),
    ).execute({
      storeId: user.storeId,
      customerId: parsed.data.customerId,
      collectorId: user.id,
      cycleId: parsed.data.cycleId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      amountReceived: parsed.data.amountReceived,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath(`/customers/${parsed.data.customerId}`);
    revalidatePath('/collections');
    revalidatePath('/customers');
    revalidatePath('/');
    return {
      ok: true,
      paymentId: result.value.paymentId,
      receiptNumber: result.value.receiptNumber,
      changeGiven: result.value.changeGiven,
    };
  } catch (error) {
    console.error('registerPaymentAction', error);
    return { ok: false, error: 'GENERIC' };
  }
}
