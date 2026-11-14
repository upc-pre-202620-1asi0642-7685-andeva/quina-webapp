import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { AddRusCapUseCase } from '@/core/application/platform/manage-platform';
import { closeDb, db } from '@/infrastructure/db/connection';
import { closePlatformDb } from '@/infrastructure/db/platform-connection';
import { loadRusStatus } from '@/infrastructure/db/queries/tax';
import { DrizzleRusCapRepository } from '@/infrastructure/db/repositories/drizzle-rus-cap-repository';
import { saveTaxSettings } from '@/infrastructure/db/repositories/drizzle-tax-settings-repository';
import {
  auditLogs,
  purchases,
  rusCategories,
  sales,
  suppliers,
  users,
} from '@/infrastructure/db/schema';
import { withTenant } from '@/infrastructure/db/with-tenant';
import { testEnv } from './env';
import { storeWithOwner } from './support/seed';

// Los archivos comparten la base: se dejan los topes sembrados como estaban
const owner = postgres(testEnv.ownerUrl, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await owner`DELETE FROM rus_categories WHERE category = 2 AND valid_from > '2017-01-01'`;
  await owner`UPDATE rus_categories SET valid_to = NULL WHERE category = 2 AND valid_from = '2017-01-01'`;
  await owner.end();
  await closeDb();
  await closePlatformDb();
});

describe('Nuevo RUS: topes de plataforma (US21 crit. 2)', () => {
  it('una vigencia nueva cierra la anterior el día previo; no se retrocede', async () => {
    const [admin] = await db
      .insert(users)
      .values({
        name: 'Admin Quina',
        email: `admin-${randomUUID().slice(0, 8)}@andeva.test`,
        emailVerified: true,
        role: 'PLATFORM_ADMIN',
      })
      .returning({ id: users.id });
    const addCap = new AddRusCapUseCase(new DrizzleRusCapRepository());
    const base = { adminId: admin!.id, category: 2 as const };

    expect(
      await addCap.execute({
        ...base,
        monthlyIncomeCap: '9000',
        monthlyPurchasesCap: '9000',
        validFrom: '2030-01-01',
      }),
    ).toEqual({ ok: true, value: undefined });
    const rows = await db.select().from(rusCategories).where(eq(rusCategories.category, 2));
    expect(rows.find((r) => r.validFrom === '2017-01-01')?.validTo).toBe('2029-12-31');
    expect(rows.find((r) => r.validFrom === '2030-01-01')).toMatchObject({
      monthlyIncomeCap: '9000.00',
      validTo: null,
    });

    expect(
      await addCap.execute({
        ...base,
        monthlyIncomeCap: '9500',
        monthlyPurchasesCap: '9500',
        validFrom: '2029-06-01',
      }),
    ).toEqual({ ok: false, error: 'NOT_AFTER_CURRENT' });
  });
});

describe('Nuevo RUS: ventas y compras del mes (US21 crit. 3 y 6)', () => {
  it('suma solo el mes de Lima en curso y se apaga fuera del Nuevo RUS', async () => {
    const ctx = await storeWithOwner();
    await withTenant(ctx.storeId, async (tx) => {
      const sale = (amount: string, saleDate: string) => ({
        storeId: ctx.storeId,
        userIdCashier: ctx.ownerId,
        saleModality: 'CASH',
        paymentMethod: 'CASH',
        totalAmount: amount,
        saleDate: new Date(saleDate),
      });
      await tx.insert(sales).values([
        sale('300.00', '2026-03-10T15:00:00Z'),
        sale('50.50', '2026-03-31T23:00:00Z'), // 31/03 18:00 en Lima: aún es marzo
        sale('999.00', '2026-03-01T04:00:00Z'), // 28/02 23:00 en Lima: fuera del mes
      ]);
      const [supplier] = await tx
        .insert(suppliers)
        .values({ storeId: ctx.storeId, taxIdNumber: '20100000001', tradeName: 'Distribuidora' })
        .returning({ id: suppliers.id });
      const purchase = (amount: string, issueDate: string, documentNumber: string) => ({
        storeId: ctx.storeId,
        supplierId: supplier!.id,
        userId: ctx.ownerId,
        documentType: 'BOLETA',
        documentNumber,
        issueDate,
        totalAmount: amount,
      });
      await tx
        .insert(purchases)
        .values([purchase('1200.00', '2026-03-05', '1'), purchase('800.00', '2026-04-01', '2')]);
    });

    const now = new Date('2026-03-20T15:00:00Z');
    expect(await loadRusStatus(ctx.storeId, now)).toEqual({
      category: 1,
      sales: '350.50',
      purchases: '1200.00',
      caps: { income: '5000.00', purchases: '5000.00' },
    });

    await saveTaxSettings({
      storeId: ctx.storeId,
      actorId: ctx.ownerId,
      taxRegime: 'RER',
      rusCategory: 1,
    });
    expect(await loadRusStatus(ctx.storeId, now)).toBeNull();
    const audit = await withTenant(ctx.storeId, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.storeId, ctx.storeId), eq(auditLogs.action, 'UPDATE_TAX_SETTINGS')),
        ),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      oldData: { taxRegime: 'NUEVO_RUS', rusCategory: 1 },
      newData: { taxRegime: 'RER', rusCategory: 1 },
    });
  });
});
