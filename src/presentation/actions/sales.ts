'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  RegisterCashSaleUseCase,
  type CashSaleError,
} from '@/core/application/sales/register-cash-sale';
import {
  RegisterCreditSaleUseCase,
  type CreditSaleError,
} from '@/core/application/sales/register-credit-sale';
import { MAX_INSTALLMENTS } from '@/core/domain/credit/credit-terms';
import type { RegisteredCreditSale } from '@/core/domain/ports/sale-repository';
import { CASH_PAYMENT_METHODS } from '@/core/domain/sales/cash-payment';
import { MAX_CART_LINES } from '@/core/domain/sales/sale-pricing';
import { DrizzleSaleRepository } from '@/infrastructure/db/repositories/drizzle-sale-repository';
import { authorizeStore } from '@/presentation/auth/guards';

const cartSchema = z
  .array(z.object({ productId: z.uuid(), quantity: z.string().max(20) }))
  .min(1)
  .max(MAX_CART_LINES);

const cashSaleSchema = z.object({
  cart: cartSchema,
  paymentMethod: z.enum(CASH_PAYMENT_METHODS),
  amountReceived: z.string().max(20),
  customerId: z.uuid().nullable(),
});

export type CashSaleInput = z.input<typeof cashSaleSchema>;

export type SaleActionError = { code: 'SESSION' | 'INVALID' | 'GENERIC' } | CashSaleError;

export type SaleActionResult =
  | { ok: true; saleId: string; total: string; changeGiven: string | null }
  | { ok: false; error: SaleActionError };

/** US07: el dueño o el empleado cobran al contado; el cajero sale de la sesión. */
export async function registerCashSaleAction(input: CashSaleInput): Promise<SaleActionResult> {
  const user = await authorizeStore('sales.create');
  if (!user) return { ok: false, error: { code: 'SESSION' } };
  const parsed = cashSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: 'INVALID' } };

  try {
    const result = await new RegisterCashSaleUseCase(new DrizzleSaleRepository()).execute({
      storeId: user.storeId,
      cashierId: user.id,
      customerId: parsed.data.customerId,
      cart: parsed.data.cart,
      paymentMethod: parsed.data.paymentMethod,
      amountReceived: parsed.data.amountReceived,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/sales');
    revalidatePath('/inventory');
    revalidatePath('/');
    return { ok: true, ...result.value };
  } catch (error) {
    console.error('registerCashSaleAction', error);
    return { ok: false, error: { code: 'GENERIC' } };
  }
}

const creditSaleSchema = z.object({
  cart: cartSchema,
  customerId: z.uuid(),
  plan: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('SINGLE') }),
    z.object({ mode: z.literal('INSTALLMENTS'), count: z.int().min(1).max(MAX_INSTALLMENTS) }),
  ]),
});

export type CreditSaleInput = z.input<typeof creditSaleSchema>;

export type CreditSaleActionError = { code: 'SESSION' | 'INVALID' | 'GENERIC' } | CreditSaleError;

export type CreditSaleActionResult =
  { ok: true; sale: RegisteredCreditSale } | { ok: false; error: CreditSaleActionError };

/** US08: fiado en el mostrador; límite, stock y ciclo se validan con todo bloqueado. */
export async function registerCreditSaleAction(
  input: CreditSaleInput,
): Promise<CreditSaleActionResult> {
  const user = await authorizeStore('sales.create');
  if (!user) return { ok: false, error: { code: 'SESSION' } };
  const parsed = creditSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: 'INVALID' } };

  try {
    const result = await new RegisterCreditSaleUseCase(new DrizzleSaleRepository()).execute({
      storeId: user.storeId,
      cashierId: user.id,
      customerId: parsed.data.customerId,
      cart: parsed.data.cart,
      plan: parsed.data.plan,
      now: new Date(),
    });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/sales');
    revalidatePath('/inventory');
    revalidatePath('/customers');
    revalidatePath('/');
    return { ok: true, sale: result.value };
  } catch (error) {
    console.error('registerCreditSaleAction', error);
    return { ok: false, error: { code: 'GENERIC' } };
  }
}
