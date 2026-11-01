import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import { RunDailyProcessUseCase } from '@/core/application/collections/run-daily-process';
import { closeDb } from '@/infrastructure/db/connection';
import { DrizzleChargeResolutionRepository } from '@/infrastructure/db/collections/drizzle-charge-resolution-repository';
import { DrizzleDailyProcess } from '@/infrastructure/db/collections/drizzle-daily-process';
import { recordEmailEvent } from '@/infrastructure/db/collections/email-events';
import { NotificationDispatcher } from '@/infrastructure/db/collections/notification-dispatcher';
import {
  OutboxCollectionsMailer,
  type OutboxCollectionsMail,
} from '@/infrastructure/email/collections-mailers';
import {
  creditCharges,
  creditChargeVoids,
  customers,
  inventoryMovements,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import {
  fiar as fiarSale,
  neighbor,
  product,
  read,
  storeWithOwner,
  type Ctx,
} from './support/seed';

/** Fía y devuelve el cargo creado, que es lo que se observa o anula. */
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

afterAll(async () => {
  await closeDb();
});

const SEP_15 = new Date('2026-09-15T15:00:00Z');
const CRON_SEP_16 = new Date('2026-09-16T11:00:00Z');
const SEP_17 = new Date('2026-09-17T15:00:00Z');
const SEP_19 = new Date('2026-09-19T15:00:00Z');
const CRON_SEP_21 = new Date('2026-09-21T11:00:00Z');
const CRON_OCT_21 = new Date('2026-10-21T11:00:00Z');

const charges = new ResolveChargeUseCase(new DrizzleChargeResolutionRepository());

async function daily(ctx: Ctx, now: Date) {
  const dir = await mkdtemp(path.join(tmpdir(), 'quina-outbox-'));
  const gateway = new DrizzleDailyProcess(
    new NotificationDispatcher(() => new OutboxCollectionsMailer(dir), 0),
    { storeIds: [ctx.storeId] },
  );
  const summary = await new RunDailyProcessUseCase(gateway).execute({ now, budgetMs: 30_000 });
  expect(summary.errors).toEqual([]);
  const mails: OutboxCollectionsMail[] = await Promise.all(
    (await readdir(dir)).map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8'))),
  );
  return mails;
}

async function objectAndVoid(ctx: Ctx, chargeId: string, now: Date) {
  const objected = await charges.object({
    storeId: ctx.storeId,
    chargeId,
    note: 'Dice que no lo sacó',
    now,
  });
  expect(objected).toEqual({ ok: true, value: undefined });
  return charges.void({
    storeId: ctx.storeId,
    chargeId,
    userId: ctx.ownerId,
    reason: 'Se cobró dos veces',
    now,
  });
}

describe('resumen diario y conformidad (US11)', () => {
  it('Pro manda el resumen al día siguiente y fija las 48 h; pasado el plazo el cargo queda conforme (crit. 1, 2 y 6)', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);

    const mails = await daily(ctx, CRON_SEP_16);
    const digest = mails.find((m) => m.kind === 'charge-digest')!;
    expect(digest.lines.map((l) => [l.kind, l.amount])).toEqual([['purchase', '25.00']]);
    expect(digest.balance).toBe('25.00');

    const [charge] = await read.charges(ctx, rosa.accountId);
    expect(charge!.notifiedAt).not.toBeNull();
    expect(charge!.consentDeadline!.getTime() - charge!.notifiedAt!.getTime()).toBe(48 * 3_600_000);

    // Pasadas las 48 h, el proceso diario lo da por conforme
    await daily(ctx, new Date(charge!.consentDeadline!.getTime() + 60_000));
    const [accepted] = await read.charges(ctx, rosa.accountId);
    expect(accepted!.consentStatus).toBe('ACCEPTED');
  });

  it('Casero no manda el resumen solo (P5)', async () => {
    const ctx = await storeWithOwner('CASERO');
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);

    const mails = await daily(ctx, CRON_SEP_16);
    expect(mails.filter((m) => m.kind === 'charge-digest')).toEqual([]);
    const [charge] = await read.charges(ctx, rosa.accountId);
    expect(charge!.notifiedAt).toBeNull();
  });

  it('no deja observar fuera de las 48 h (crit. 4)', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    const sale = await fiar(ctx, rosa.customerId, milk, SEP_15);
    await daily(ctx, CRON_SEP_16);

    const late = await charges.object({
      storeId: ctx.storeId,
      chargeId: sale.chargeId,
      note: 'Tarde',
      now: SEP_19,
    });
    expect(late).toEqual({ ok: false, error: 'OBJECTION_WINDOW_CLOSED' });
  });
});

describe('anulación de cargos observados (US11 crit. 7)', () => {
  it('en el ciclo abierto: el stock vuelve con CUSTOMER_RETURN, la deuda baja y el corte lo descuenta', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    const wrong = await fiar(ctx, rosa.customerId, milk, SEP_17, { mode: 'SINGLE' }, '2');
    expect(await read.stock(ctx, milk)).toBe('97.000');

    const voided = await objectAndVoid(ctx, wrong.chargeId, SEP_19);
    expect(voided).toEqual({ ok: true, value: { voidedAmount: '50.00' } });

    expect(await read.stock(ctx, milk)).toBe('99.000');
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('25.00');
    const [, charge] = await read.charges(ctx, rosa.accountId);
    expect(charge!.status).toBe('VOIDED');
    expect(charge!.resolutionNote).toBe('Se cobró dos veces');

    const movements = await withTenant(ctx.storeId, async (tx) => {
      const [row] = await tx
        .select()
        .from(creditChargeVoids)
        .where(eq(creditChargeVoids.creditChargeId, wrong.chargeId));
      return tx
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.referenceId, row!.id));
    });
    expect(movements.map((m) => [m.movementType, m.quantity, m.stockAfter])).toEqual([
      ['CUSTOMER_RETURN', '2.000', '99.000'],
    ]);

    await daily(ctx, CRON_SEP_21);
    const [september] = await read.cycles(ctx, rosa.accountId);
    expect(september!.purchasesTotal).toBe('75.00');
    // La anulación cancela la línea entera de la compra, con su interés (rebanada 0)
    expect(september!.adjustmentsTotal).toBe('50.45');
    // Solo la compra que quedó paga interés: 11 días sobre 25.00
    expect(september!.totalDue).toBe('25.27');
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('25.27');
  });

  it('en un ciclo ya liquidado recalcula sus totales y, si queda en cero, lo da por pagado (P2, D12)', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    const sale = await fiar(ctx, rosa.customerId, milk, SEP_15);
    await daily(ctx, CRON_SEP_21);
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('25.27');

    const voided = await objectAndVoid(ctx, sale.chargeId, new Date('2026-09-22T15:00:00Z'));
    expect(voided).toEqual({ ok: true, value: { voidedAmount: '25.27' } });

    const [september] = await read.cycles(ctx, rosa.accountId);
    expect(september!.adjustmentsTotal).toBe('25.27');
    expect(september!.totalDue).toBe('0.00');
    expect(september!.status).toBe('PAID');
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('0.00');
  });

  it('en cuotas: se anula antes de liquidar la primera cuota y no después (P3)', async () => {
    const ctx = await storeWithOwner();
    const tv = await product(ctx, { name: 'Licuadora', price: '300.00', allowsInstallments: true });
    const rosa = await neighbor(ctx);
    const early = await fiar(ctx, rosa.customerId, tv, SEP_15, { mode: 'INSTALLMENTS', count: 3 });
    const late = await fiar(ctx, rosa.customerId, tv, SEP_17, { mode: 'INSTALLMENTS', count: 3 });

    expect(await objectAndVoid(ctx, early.chargeId, SEP_19)).toEqual({
      ok: true,
      value: { voidedAmount: '300.00' },
    });
    const voidedRows = (await read.installments(ctx, rosa.accountId)).filter(
      (i) => i.creditChargeId === early.chargeId,
    );
    expect(voidedRows.every((i) => i.status === 'VOIDED')).toBe(true);
    expect((await read.account(ctx, rosa.accountId)).currentBalance).toBe('300.00');

    // La primera cuota del otro cargo se liquida en el corte del 20 de octubre
    await daily(ctx, CRON_SEP_21);
    await daily(ctx, CRON_OCT_21);
    const result = await objectAndVoid(ctx, late.chargeId, CRON_OCT_21).catch(() => null);
    expect(result).toEqual({ ok: false, error: 'INSTALLMENT_ALREADY_BILLED' });
  });

  it('solo anula cargos observados y no ve cargos de otra tienda (RLS)', async () => {
    const ctx = await storeWithOwner();
    const other = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    const sale = await fiar(ctx, rosa.customerId, milk, SEP_15);

    expect(
      await charges.void({
        storeId: ctx.storeId,
        chargeId: sale.chargeId,
        userId: ctx.ownerId,
        reason: 'Sin observar',
        now: SEP_17,
      }),
    ).toEqual({ ok: false, error: 'CHARGE_NOT_OBJECTED' });
    expect(
      await charges.object({
        storeId: other.storeId,
        chargeId: sale.chargeId,
        note: 'Ajena',
        now: SEP_17,
      }),
    ).toEqual({ ok: false, error: 'CHARGE_NOT_FOUND' });
  });

  it('confirmar deja el cargo conforme con la nota del dueño', async () => {
    const ctx = await storeWithOwner();
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    const sale = await fiar(ctx, rosa.customerId, milk, SEP_15);
    await charges.object({
      storeId: ctx.storeId,
      chargeId: sale.chargeId,
      note: 'Duda',
      now: SEP_17,
    });

    expect(
      await charges.confirm({
        storeId: ctx.storeId,
        chargeId: sale.chargeId,
        userId: ctx.ownerId,
        note: 'Lo sacó su hijo',
        now: SEP_19,
      }),
    ).toEqual({ ok: true, value: undefined });
    const [charge] = await read.charges(ctx, rosa.accountId);
    expect([charge!.consentStatus, charge!.resolutionNote]).toEqual([
      'ACCEPTED',
      'Lo sacó su hijo',
    ]);
  });
});

describe('rebotes de correo (US11 crit. 5, D14)', () => {
  it('marca el aviso como rebotado y la ficha del vecino; una entrega posterior no lo pisa', async () => {
    const ctx = await storeWithOwner('BODEGA_PRO');
    const milk = await product(ctx);
    const rosa = await neighbor(ctx);
    await fiar(ctx, rosa.customerId, milk, SEP_15);
    await daily(ctx, CRON_SEP_16);
    const [log] = await read.logs(ctx);
    expect(log!.status).toBe('SENT');

    const at = new Date('2026-09-16T11:05:00Z');
    expect(
      await recordEmailEvent({
        storeId: ctx.storeId,
        providerMessageId: log!.providerMessageId!,
        status: 'BOUNCED',
        at,
      }),
    ).toBe(true);
    expect(
      await recordEmailEvent({
        storeId: ctx.storeId,
        providerMessageId: log!.providerMessageId!,
        status: 'DELIVERED',
        at,
      }),
    ).toBe(false);

    const [after] = await read.logs(ctx);
    expect(after!.status).toBe('BOUNCED');
    const bounced = await withTenant(ctx.storeId, async (tx) => {
      const [row] = await tx
        .select({ at: customers.emailBouncedAt })
        .from(customers)
        .where(eq(customers.id, rosa.customerId));
      return row!.at;
    });
    expect(bounced).toEqual(at);
  });
});
