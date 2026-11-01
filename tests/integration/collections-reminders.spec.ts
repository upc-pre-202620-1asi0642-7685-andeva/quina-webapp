import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import { closeDb } from '@/infrastructure/db/connection';
import {
  DrizzleDailyProcess,
  queuePaymentReminders,
} from '@/infrastructure/db/collections/drizzle-daily-process';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import {
  OutboxCollectionsMailer,
  type OutboxCollectionsMail,
} from '@/infrastructure/email/collections-mailers';
import { listTodayNotices } from '@/infrastructure/db/queries/collections';
import { fiar, neighbor, product, storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

const SEP_15 = new Date('2026-09-15T15:00:00Z');
const CRON = (day: number) => new Date(`2026-09-${day}T11:00:00Z`);

async function setup(plan: 'CASERO' | 'BODEGA_PRO') {
  const ctx = await storeWithOwner(plan, { contactPhone: '987654321' });
  const dir = await mkdtemp(path.join(tmpdir(), 'quina-outbox-'));
  const gateway = new DrizzleDailyProcess(
    new NotificationDispatcher(() => new OutboxCollectionsMailer(dir), 0),
    { storeIds: [ctx.storeId] },
  );
  const daily = async (now: Date) => {
    const summary = await new RunDailyProcessUseCase(gateway).execute({ now, budgetMs: 30_000 });
    expect(summary.errors).toEqual([]);
  };
  const mails = async (kind: string): Promise<OutboxCollectionsMail[]> =>
    (
      await Promise.all(
        (await readdir(dir)).map(async (f) =>
          JSON.parse(await readFile(path.join(dir, f), 'utf8')),
        ),
      )
    ).filter((m: OutboxCollectionsMail) => m.kind === kind);
  return { ctx, daily, mails };
}

describe('recordatorios de pago (US12)', () => {
  it('Pro avisa una sola vez cuando faltan 3 días o menos, con monto, fecha y contacto (crit. 1, 2, 4 y 5)', async () => {
    const { ctx, daily, mails } = await setup('BODEGA_PRO');
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await daily(CRON(21));
    await daily(CRON(22)); // faltan 4 días: todavía no
    expect(await mails('payment-reminder')).toEqual([]);

    await daily(CRON(23));
    await daily(CRON(24));
    const reminders = await mails('payment-reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      total: '25.27',
      paymentDueDate: '2026-09-26',
      storeContact: '987654321',
    });

    const today = await listTodayNotices(ctx.storeId, CRON(23));
    expect(today.map((n) => [n.type, n.status])).toContainEqual(['PAYMENT_REMINDER', 'SENT']);
  });

  it('no manda recordatorio de una deuda ya vencida; manda el aviso de mora (D1b, crit. 6)', async () => {
    const { ctx, daily, mails } = await setup('BODEGA_PRO');
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await daily(CRON(21));
    // El cron se saltó hasta después del vencimiento
    await daily(CRON(28));
    expect(await mails('payment-reminder')).toEqual([]);
    expect(await mails('late-payment')).toHaveLength(1);
  });

  it('Casero no lo manda solo; el botón lo pone en cola (P5)', async () => {
    const { ctx, daily, mails } = await setup('CASERO');
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await daily(CRON(21));
    await daily(CRON(24));
    expect(await mails('payment-reminder')).toEqual([]);

    expect(await queuePaymentReminders(ctx.storeId, CRON(24))).toBe(1);
    expect(await queuePaymentReminders(ctx.storeId, CRON(24))).toBe(0);
  });
});
