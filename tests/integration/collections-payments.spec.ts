import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { RegisterPaymentUseCase } from '@/core/application/collections/register-payment';
import { ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import type { DebtPaymentMethod } from '@/core/domain/ports/payment-repository';
import { closeDb } from '@/infrastructure/db/connection';
import { DrizzleChargeResolutionRepository } from '@/infrastructure/db/collections/drizzle-charge-resolution-repository';
import { DrizzleDailyProcess } from '@/infrastructure/db/collections/drizzle-daily-process';
import { DrizzleCreditAccountRepository } from '@/infrastructure/db/repositories/drizzle-credit-account-repository';
import { DrizzlePaymentRepository } from '@/infrastructure/db/collections/drizzle-payment-repository';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import {
  OutboxCollectionsMailer,
  type OutboxCollectionsMail,
} from '@/infrastructure/email/collections-mailers';
import { creditCharges, debtPayments, paymentAllocations } from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import {
  fiar as fiarSale,
  neighbor,
  product,
  read,
  storeWithOwner,
  type Ctx,
} from './support/seed';

afterAll(async () => {
  await closeDb();
});

const SEP_15 = new Date('2026-09-15T15:00:00Z');
const SEP_20 = new Date('2026-09-20T15:00:00Z');
const CRON_SEP_21 = new Date('2026-09-21T11:00:00Z');
const SEP_25 = new Date('2026-09-25T15:00:00Z');
const CRON_SEP_27 = new Date('2026-09-27T11:00:00Z');
const SEP_30 = new Date('2026-09-30T15:00:00Z');
const OCT_5 = new Date('2026-10-05T15:00:00Z');
const CRON_OCT_21 = new Date('2026-10-21T11:00:00Z');

const repo = new DrizzlePaymentRepository();

async function setup(plan: 'CASERO' | 'BODEGA_PRO' = 'CASERO') {
  const ctx = await storeWithOwner(plan);
  const dir = await mkdtemp(path.join(tmpdir(), 'quina-outbox-'));
  const dispatcher = new NotificationDispatcher(() => new OutboxCollectionsMailer(dir), 0);
  const gateway = new DrizzleDailyProcess(dispatcher, { storeIds: [ctx.storeId] });
  const daily = async (now: Date) => {
    const summary = await new RunDailyProcessUseCase(gateway).execute({ now, budgetMs: 30_000 });
    expect(summary.errors).toEqual([]);
  };
  const mails = async (): Promise<OutboxCollectionsMail[]> =>
    Promise.all(
      (await readdir(dir)).map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8'))),
    );
  const pay = (
    customerId: string,
    cycleId: string,
    amount: string,
    now: Date,
    method: DebtPaymentMethod = 'YAPE',
    amountReceived = '',
  ) =>
    new RegisterPaymentUseCase(repo, (storeId, logId) =>
      dispatcher.dispatchOne(storeId, logId, now),
    ).execute({
      storeId: ctx.storeId,
      customerId,
      collectorId: ctx.ownerId,
      cycleId,
      amount,
      method,
      amountReceived,
      now,
    });
  const preview = (customerId: string, now: Date) =>
    repo.preview({ storeId: ctx.storeId, customerId, now });
  return { ctx, daily, mails, pay, preview };
}

async function fiar(...args: Parameters<typeof fiarSale>) {
  const sale = await fiarSale(...args);
  const chargeId = await withTenant(args[0].storeId, async (tx) => {
    const [row] = await tx
      .select({ id: creditCharges.id })
      .from(creditCharges)
      .where(eq(creditCharges.saleId, sale.saleId));
    return row!.id;
  });
  return { ...sale, chargeId };
}

async function paymentsOf(ctx: Ctx, paymentId: string) {
  return withTenant(ctx.storeId, async (tx) => ({
    payment: (await tx.select().from(debtPayments).where(eq(debtPayments.id, paymentId)))[0]!,
    allocations: await tx
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.debtPaymentId, paymentId)),
  }));
}

describe('cobro de un ciclo (US13)', () => {
  it('a tiempo paga lo liquidado, deja recibo R-000001 y el saldo en cero (crit. 1, 5 y 6)', async () => {
    const { ctx, daily, mails, pay, preview } = await setup();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await fiar(ctx, rosa.customerId, milk, SEP_20);
    await daily(CRON_SEP_21);

    const quote = await preview(rosa.customerId, SEP_25);
    expect(quote.ok && [quote.value.daysLate, quote.value.amountDue]).toEqual([0, '50.42']);
    const cycleId = quote.ok ? quote.value.cycle.id : '';

    const result = await pay(rosa.customerId, cycleId, '50.42', SEP_25, 'CASH', '60');
    expect(result.ok && [result.value.receiptNumber, result.value.changeGiven]).toEqual([
      'R-000001',
      '9.58',
    ]);

    const [september] = await read.cycles(ctx, rosa.accountId);
    expect([september!.status, september!.amountPaid]).toEqual(['PAID', '50.42']);
    expect((await read.charges(ctx, rosa.accountId)).map((c) => c.status)).toEqual([
      'PAID',
      'PAID',
    ]);
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('0.00');

    const { payment, allocations } = await paymentsOf(ctx, result.ok ? result.value.paymentId : '');
    expect([payment.principalPaid, payment.compensatoryInterestPaid]).toEqual(['50.00', '0.42']);
    expect(allocations.map((a) => [a.allocationType, a.amount]).sort()).toEqual(
      [
        ['COMPENSATORY_INTEREST', '0.15'],
        ['COMPENSATORY_INTEREST', '0.27'],
        ['PRINCIPAL', '25.00'],
        ['PRINCIPAL', '25.00'],
      ].sort(),
    );

    const receipt = (await mails()).find((m) => m.kind === 'payment-receipt')!;
    expect([receipt.receiptNumber, receipt.total]).toEqual(['R-000001', '50.42']);
  });

  it('con atraso cobra la mora de cada línea, no la suma al saldo y desbloquea el fiado (crit. 2, 3 y 7)', async () => {
    const { ctx, daily, pay, preview } = await setup();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await fiar(ctx, rosa.customerId, milk, SEP_20);
    await daily(CRON_SEP_21);
    await daily(CRON_SEP_27);
    expect((await read.cycles(ctx, rosa.accountId))[0]!.status).toBe('OVERDUE');
    await expect(fiar(ctx, rosa.customerId, milk, SEP_30)).rejects.toThrow();

    // 4 días de atraso (26 → 30) al 0.1 % diario: 25.27 → 0.10 y 25.15 → 0.10
    const quote = await preview(rosa.customerId, SEP_30);
    expect(quote.ok && [quote.value.daysLate, quote.value.moratoryInterest]).toEqual([4, '0.20']);
    const cycleId = quote.ok ? quote.value.cycle.id : '';
    expect(await pay(rosa.customerId, cycleId, '50.42', SEP_30)).toEqual({
      ok: false,
      error: 'PARTIAL_PAYMENT_NOT_ALLOWED',
    });

    const paid = await pay(rosa.customerId, cycleId, '50.62', SEP_30);
    expect(paid.ok).toBe(true);
    const [september] = await read.cycles(ctx, rosa.accountId);
    expect([september!.status, september!.moratoryInterestTotal]).toEqual(['PAID', '0.20']);
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('0.00');
    const { payment } = await paymentsOf(ctx, paid.ok ? paid.value.paymentId : '');
    expect([payment.daysLate, payment.moratoryInterestPaid]).toEqual([4, '0.20']);

    // Pagado el ciclo vencido, vuelve a fiar
    await expect(fiar(ctx, rosa.customerId, milk, OCT_5)).resolves.toBeTruthy();
  });

  it('no cobra un ciclo abierto ni uno con un cargo observado sin resolver (crit. 4, D8)', async () => {
    const { ctx, daily, preview } = await setup();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    const sale = await fiar(ctx, rosa.customerId, milk, SEP_15);
    expect(await preview(rosa.customerId, SEP_20)).toEqual({
      ok: false,
      error: 'NO_PAYABLE_CYCLE',
    });

    await daily(CRON_SEP_21);
    await new ResolveChargeUseCase(new DrizzleChargeResolutionRepository()).object({
      storeId: ctx.storeId,
      userId: ctx.ownerId,
      chargeId: sale.chargeId,
      note: 'No lo reconoce',
      now: SEP_25,
    });
    const quote = await preview(rosa.customerId, SEP_25);
    expect(quote.ok && quote.value.objections.map((o) => o.chargeId)).toEqual([sale.chargeId]);
    const result = await repo.register({
      storeId: ctx.storeId,
      customerId: rosa.customerId,
      collectorId: ctx.ownerId,
      cycleId: quote.ok ? quote.value.cycle.id : '',
      amount: '25.27',
      method: 'YAPE',
      amountReceived: '',
      now: SEP_25,
    });
    expect(result).toEqual({ ok: false, error: 'OBJECTION_PENDING' });
  });

  it('con dos ciclos por pagar cobra primero el más antiguo y numera los recibos (crit. 8, D7)', async () => {
    const { ctx, daily, pay, preview } = await setup();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await daily(CRON_SEP_21);
    await daily(CRON_SEP_27);
    const [september] = await read.cycles(ctx, rosa.accountId);

    const first = await preview(rosa.customerId, SEP_30);
    expect(first.ok && [first.value.cycle.id, first.value.laterCycles]).toEqual([september!.id, 0]);
    expect(
      await pay(rosa.customerId, '00000000-0000-4000-8000-000000000000', '25.37', SEP_30),
    ).toEqual({ ok: false, error: 'CYCLE_NOT_OLDEST' });
    const paid = await pay(
      rosa.customerId,
      september!.id,
      first.ok ? first.value.amountDue : '',
      SEP_30,
    );
    expect(paid.ok && paid.value.receiptNumber).toBe('R-000001');

    await fiar(ctx, rosa.customerId, milk, OCT_5);
    await daily(CRON_OCT_21);
    const second = await preview(rosa.customerId, new Date('2026-10-22T15:00:00Z'));
    const again = await pay(
      rosa.customerId,
      second.ok ? second.value.cycle.id : '',
      second.ok ? second.value.amountDue : '',
      new Date('2026-10-22T15:00:00Z'),
    );
    expect(again.ok && again.value.receiptNumber).toBe('R-000002');
  });

  it('en cuotas: cada pago libera su capital y al pagar la última el saldo vuelve a cero (D3, D3b)', async () => {
    const { ctx, daily, pay, preview } = await setup();
    const blender = await product(ctx, {
      name: 'Licuadora',
      price: '300.00',
      allowsInstallments: true,
    });
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, blender, SEP_15, { mode: 'INSTALLMENTS', count: 3 });
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('300.00');

    const cutOffs = ['2026-10-21', '2026-11-21', '2026-12-21'];
    for (const day of cutOffs) {
      await daily(new Date(`${day}T11:00:00Z`));
      const on = new Date(`${day}T15:00:00Z`);
      const quote = await preview(rosa.customerId, on);
      expect(quote.ok).toBe(true);
      if (!quote.ok) return;
      const paid = await pay(rosa.customerId, quote.value.cycle.id, quote.value.amountDue, on);
      expect(paid.ok).toBe(true);
    }
    expect((await read.installments(ctx, rosa.accountId)).map((i) => i.status)).toEqual([
      'PAID',
      'PAID',
      'PAID',
    ]);
    const [charge] = await read.charges(ctx, rosa.accountId);
    expect(charge!.status).toBe('PAID');
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('0.00');
  });
});

describe('cambio de días de corte y pago (P7)', () => {
  const termsFor = (ctx: Ctx, customerId: string, cutOffDay: number) =>
    new DrizzleCreditAccountRepository().saveTerms({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      customerId,
      terms: {
        currency: 'PEN',
        creditLimit: '1000.00',
        compensatory: {
          type: 'EFFECTIVE',
          value: '0.0300',
          period: 'MONTHLY',
          capitalization: null,
        },
        moratory: { type: 'EFFECTIVE', value: '0.0010', period: 'DAILY', capitalization: null },
        cutOffDay,
        paymentDueDay: cutOffDay + 6,
        maxInstallmentMonths: 6,
      },
      consent: {
        type: 'CREDIT_TERMS',
        version: 'v1',
        text: 'Condiciones',
        ip: '127.0.0.1',
        userAgent: 'test',
      },
      canOpen: () => true,
      now: SEP_25,
    });

  it('bloquea el cambio con un ciclo abierto con compras o sin pagar, y lo permite al pagar', async () => {
    const { ctx, daily, pay, preview } = await setup();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    expect(await termsFor(ctx, rosa.customerId, 10)).toBe('DAYS_LOCKED');

    await daily(CRON_SEP_21);
    expect(await termsFor(ctx, rosa.customerId, 10)).toBe('DAYS_LOCKED');
    // Las tasas y el límite sí cambian: cada cargo ya congeló los suyos
    expect(await termsFor(ctx, rosa.customerId, 20)).toBe('UPDATED');

    const quote = await preview(rosa.customerId, SEP_25);
    if (!quote.ok) throw new Error(quote.error);
    await pay(rosa.customerId, quote.value.cycle.id, quote.value.amountDue, SEP_25);
    expect(await termsFor(ctx, rosa.customerId, 10)).toBe('UPDATED');
  });
});
