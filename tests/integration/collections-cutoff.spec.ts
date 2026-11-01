import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import { closeDb } from '@/infrastructure/db/connection';
import { DrizzleDailyProcess } from '@/infrastructure/db/collections/drizzle-daily-process';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import {
  OutboxCollectionsMailer,
  type OutboxCollectionsMail,
} from '@/infrastructure/email/collections-mailers';
import { fiar, neighbor, product, read, storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

const SEP_15 = new Date('2026-09-15T15:00:00Z'); // 10:00 en Lima, antes del corte del 20
const SEP_20_LATE = new Date('2026-09-21T04:30:00Z'); // 20/09 23:30 en Lima: aún entra al corte
const SEP_21_EARLY = new Date('2026-09-21T05:30:00Z'); // 21/09 00:30 en Lima: ciclo siguiente
const CRON_SEP_21 = new Date('2026-09-21T11:00:00Z'); // 06:00 en Lima, el día después del corte

async function outbox(ctx: { storeId: string }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'quina-outbox-'));
  const gateway = new DrizzleDailyProcess(
    new NotificationDispatcher(() => new OutboxCollectionsMailer(dir), 0),
    { storeIds: [ctx.storeId] },
  );
  const mails = async (): Promise<OutboxCollectionsMail[]> =>
    Promise.all(
      (await readdir(dir)).map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8'))),
    );
  return { gateway, mails };
}

describe('corte diario en PostgreSQL (US10)', () => {
  it('liquida las compras hasta las 23:59:59 del corte, con interés por días, y deja el estado de cuenta (crit. 1, 2, 4, 5 y 6)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await fiar(ctx, rosa.customerId, milk, SEP_20_LATE);
    await fiar(ctx, rosa.customerId, milk, SEP_21_EARLY);
    const { gateway, mails } = await outbox(ctx);

    const summary = await new RunDailyProcessUseCase(gateway).execute({
      now: CRON_SEP_21,
      budgetMs: 30_000,
    });
    expect(summary.errors).toEqual([]);

    const [september, october] = await read.cycles(ctx, rosa.accountId);
    expect(september!.status).toBe('BILLED');
    expect(september!.purchasesTotal).toBe('50.00');
    // 11 días (15→26) y 6 días (20→26) al 3 % mensual efectivo
    expect(september!.compensatoryInterestTotal).toBe('0.42');
    expect(september!.totalDue).toBe('50.42');
    expect(october!.status).toBe('OPEN');

    const charges = await read.charges(ctx, rosa.accountId);
    expect(charges.map((c) => [c.status, c.compensatoryInterest])).toEqual([
      ['BILLED', '0.27'],
      ['BILLED', '0.15'],
      ['PENDING', null],
    ]);

    // La deuda sube el interés liquidado: 75.00 de capital + 0.42
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('75.42');

    const statement = (await mails()).find((m) => m.kind === 'cycle-statement')!;
    expect(statement.total).toBe('50.42');
    expect(statement.lines.map((l) => l.kind)).toEqual(['purchase', 'purchase']);
    expect(statement.paymentDueDate).toBe('2026-09-26');
    const [refreshed] = await read.cycles(ctx, rosa.accountId);
    expect(refreshed!.statementSentAt).not.toBeNull();
  });

  it('es idempotente: correrlo de nuevo no vuelve a liquidar ni a enviar', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    const { gateway, mails } = await outbox(ctx);
    const run = () =>
      new RunDailyProcessUseCase(gateway).execute({ now: CRON_SEP_21, budgetMs: 30_000 });

    await run();
    const second = await run();
    expect(second.steps.cutoff).toBe(0);
    expect((await mails()).filter((m) => m.kind === 'cycle-statement')).toHaveLength(1);
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('25.27');
  });

  it('si un día no corrió, el siguiente recupera el corte (D1)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    const { gateway } = await outbox(ctx);
    await gateway.settleDueCycles(ctx.storeId, new Date('2026-09-24T11:00:00Z'));
    const [september] = await read.cycles(ctx, rosa.accountId);
    expect(september!.status).toBe('BILLED');
  });

  it('el mismo día del corte todavía no liquida', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    const { gateway } = await outbox(ctx);
    expect(await gateway.settleDueCycles(ctx.storeId, new Date('2026-09-20T23:00:00Z'))).toBe(0);
  });

  it('en cuotas: el ciclo de la compra queda en cero y cada cuota crea y liquida su ciclo aunque no haya compras (crit. 3 y 7, D3, D12)', async () => {
    const ctx = await storeWithOwner();
    const tv = await product(ctx, { name: 'Licuadora', price: '120.00', allowsInstallments: true });
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, tv, SEP_15, { mode: 'INSTALLMENTS', count: 3 });
    const { gateway, mails } = await outbox(ctx);

    await gateway.settleDueCycles(ctx.storeId, CRON_SEP_21);
    const [purchaseCycle] = await read.cycles(ctx, rosa.accountId);
    expect(purchaseCycle!.status).toBe('PAID');
    expect(purchaseCycle!.totalDue).toBe('0.00');
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('120.00');

    // Octubre: el vecino no compró nada, pero vence la cuota 1 el 26/10
    await gateway.settleDueCycles(ctx.storeId, new Date('2026-10-21T11:00:00Z'));
    const cycles = await read.cycles(ctx, rosa.accountId);
    expect(cycles).toHaveLength(2);
    const october = cycles[1]!;
    const installments = await read.installments(ctx, rosa.accountId);
    expect(october.status).toBe('BILLED');
    expect(october.installmentsTotal).toBe(installments[0]!.totalInstallmentAmount);
    expect(october.totalDue).toBe(installments[0]!.totalInstallmentAmount);

    // La deuda sube solo lo que la cuota excede al capital original que libera
    const balance = Number((await read.account(ctx, rosa.accountId)).currentBalance);
    expect(balance).toBeGreaterThan(120);
    expect(balance).toBeLessThan(120 + Number(installments[0]!.totalInstallmentAmount));

    await gateway.dispatchPending(
      ctx.storeId,
      new Date('2026-10-21T11:00:00Z'),
      new Date(Date.now() + 10_000),
    );
    const statement = (await mails()).find((m) => m.kind === 'cycle-statement')!;
    expect(statement.lines).toEqual([
      { kind: 'installment', number: 1, total: 3, amount: installments[0]!.totalInstallmentAmount },
    ]);
  });
});
