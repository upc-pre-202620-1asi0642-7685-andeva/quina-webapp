import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { Quantity } from '@/core/domain/catalog/quantity';
import type { BillingCycle } from '@/core/domain/credit/billing-cycle';
import type { CreditAccountStatus } from '@/core/domain/ports/credit-account-repository';
import type {
  CreditSaleRepositoryError,
  RegisterCashSaleData,
  RegisterCreditSaleData,
  RegisteredCreditSale,
  RegisteredSale,
  SaleRepository,
} from '@/core/domain/ports/sale-repository';
import type { PricedSale, SaleProduct } from '@/core/domain/sales/sale-pricing';
import { BusinessDate } from '@/core/domain/shared/business-date';
import { err, ok, type Result } from '@/core/domain/shared/result';
import {
  auditLogs,
  creditAccounts,
  creditCharges,
  creditInstallments,
  customers,
  inventoryMovements,
  products,
  saleItems,
  sales,
  settlementCycles,
  units,
} from '../schema';
import { withTenant, type Tx } from '../with-tenant';
import { termsFromRow } from './drizzle-credit-account-repository';

/**
 * Bloquea los productos del carrito en orden de id (D14): dos ventas que se
 * cruzan esperan en el mismo orden y no se bloquean entre sí.
 */
export async function lockSaleProducts(
  tx: Tx,
  storeId: string,
  productIds: string[],
): Promise<SaleProduct[]> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];
  return tx
    .select({
      id: products.id,
      name: products.name,
      isService: products.isService,
      isActive: products.isActive,
      allowDecimals: units.allowDecimals,
      allowsInstallments: products.allowsInstallments,
      currentStock: products.currentStock,
      cashPrice: products.cashPrice,
      creditPrice: products.creditPrice,
      currentAverageCost: products.currentAverageCost,
    })
    .from(products)
    .innerJoin(units, eq(units.id, products.unitId))
    .where(and(eq(products.storeId, storeId), inArray(products.id, ids)))
    .orderBy(asc(products.id))
    .for('update', { of: products });
}

/**
 * Asienta ítems, descuenta stock y escribe la salida `SALE_EXIT` de cada producto
 * físico (US07 crit. 5): cantidad negativa, costo vigente y la venta como origen.
 */
export async function writeSaleLines(
  tx: Tx,
  input: { storeId: string; saleId: string; cashierId: string; priced: PricedSale; now: Date },
): Promise<void> {
  const { storeId, saleId, cashierId, priced, now } = input;
  await tx.insert(saleItems).values(
    priced.lines.map((line) => ({
      storeId,
      saleId,
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toFixed2(),
      unitCostSnapshot: line.unitCost,
      subtotal: line.subtotal.toFixed2(),
    })),
  );
  for (const line of priced.lines) {
    if (line.stockAfter === null) continue;
    await tx
      .update(products)
      .set({ currentStock: line.stockAfter, updatedAt: now })
      .where(eq(products.id, line.productId));
    const exit = Quantity.minus('0', line.quantity);
    await tx.insert(inventoryMovements).values({
      storeId,
      productId: line.productId,
      movementType: 'SALE_EXIT',
      referenceId: saleId,
      quantity: exit,
      unitCost: line.unitCost,
      totalCost: Quantity.valuedAt(exit, line.unitCost),
      stockAfter: line.stockAfter,
      // US16 crit. 2: la venta no cambia el costo promedio
      averageCostAfter: line.unitCost,
      userId: cashierId,
      createdAt: now,
    });
  }
}

/**
 * Ciclo de la compra por (cuenta, año, mes) (D8): si no existe se abre con el
 * número siguiente; si ya se liquidó, no admite cargos nuevos. Sus totales se
 * calculan en el corte (Plan 4).
 */
async function openCycleFor(
  tx: Tx,
  storeId: string,
  accountId: string,
  cycle: BillingCycle,
): Promise<string | null> {
  const [existing] = await tx
    .select({ id: settlementCycles.id, status: settlementCycles.status })
    .from(settlementCycles)
    .where(
      and(
        eq(settlementCycles.creditAccountId, accountId),
        eq(settlementCycles.periodYear, cycle.periodYear),
        eq(settlementCycles.periodMonth, cycle.periodMonth),
      ),
    );
  if (existing) return existing.status === 'OPEN' ? existing.id : null;
  const [last] = await tx
    .select({ number: max(settlementCycles.cycleNumber) })
    .from(settlementCycles)
    .where(eq(settlementCycles.creditAccountId, accountId));
  const [created] = await tx
    .insert(settlementCycles)
    .values({
      storeId,
      creditAccountId: accountId,
      cycleNumber: (last?.number ?? 0) + 1,
      periodYear: cycle.periodYear,
      periodMonth: cycle.periodMonth,
      cutOffDate: cycle.cutOffInstant,
      paymentDueDate: cycle.paymentDueInstant,
    })
    .returning({ id: settlementCycles.id });
  return created!.id;
}

export class DrizzleSaleRepository implements SaleRepository {
  async registerCash<E>(
    data: RegisterCashSaleData<E>,
  ): Promise<Result<RegisteredSale, E | 'CUSTOMER_NOT_FOUND'>> {
    return withTenant(data.storeId, async (tx) => {
      if (data.customerId) {
        const [customer] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.id, data.customerId),
              eq(customers.storeId, data.storeId),
              eq(customers.isActive, true),
            ),
          );
        if (!customer) return err('CUSTOMER_NOT_FOUND' as const);
      }
      const locked = await lockSaleProducts(
        tx,
        data.storeId,
        data.cart.map((line) => line.productId),
      );
      const settled = data.settle(locked);
      if (!settled.ok) return settled;
      const { priced, payment } = settled.value;

      const [sale] = await tx
        .insert(sales)
        .values({
          storeId: data.storeId,
          userIdCashier: data.cashierId,
          customerId: data.customerId,
          saleModality: 'CASH',
          paymentMethod: payment.method,
          totalAmount: priced.total.toFixed2(),
          amountReceived: payment.amountReceived?.toFixed2() ?? null,
          changeGiven: payment.changeGiven?.toFixed2() ?? null,
          totalCost: priced.totalCost.toFixed2(),
          profitMargin: priced.profit.toFixed2(),
          saleDate: data.now,
          createdAt: data.now,
        })
        .returning({ id: sales.id });
      const saleId = sale!.id;
      await writeSaleLines(tx, {
        storeId: data.storeId,
        saleId,
        cashierId: data.cashierId,
        priced,
        now: data.now,
      });
      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.cashierId,
        action: 'CREATE_CASH_SALE',
        entityName: 'sales',
        entityId: saleId,
        newData: {
          saleModality: 'CASH',
          paymentMethod: payment.method,
          totalAmount: priced.total.toFixed2(),
          customerId: data.customerId,
          itemsCount: priced.lines.length,
        },
        createdAt: data.now,
      });
      return ok({
        saleId,
        total: priced.total.toFixed2(),
        changeGiven: payment.changeGiven?.toFixed2() ?? null,
      });
    });
  }

  async registerCredit<E>(
    data: RegisterCreditSaleData<E>,
  ): Promise<Result<RegisteredCreditSale, E | CreditSaleRepositoryError>> {
    return withTenant(data.storeId, async (tx) => {
      // D14: primero la cuenta (serializa ciclo y disponible del vecino), luego productos
      const [row] = await tx
        .select({ account: creditAccounts, customerActive: customers.isActive })
        .from(creditAccounts)
        .innerJoin(customers, eq(customers.id, creditAccounts.customerId))
        .where(
          and(
            eq(creditAccounts.customerId, data.customerId),
            eq(creditAccounts.storeId, data.storeId),
          ),
        )
        .for('update', { of: creditAccounts });
      if (!row) return err('ACCOUNT_NOT_FOUND' as const);
      const { account } = row;
      const [overdue] = await tx
        .select({ id: settlementCycles.id })
        .from(settlementCycles)
        .where(
          and(
            eq(settlementCycles.creditAccountId, account.id),
            eq(settlementCycles.status, 'OVERDUE'),
          ),
        )
        .limit(1);
      const terms = termsFromRow(account);
      const locked = await lockSaleProducts(
        tx,
        data.storeId,
        data.cart.map((line) => line.productId),
      );
      const settled = data.settle(
        {
          id: account.id,
          customerActive: row.customerActive,
          status: account.status as CreditAccountStatus,
          terms,
          currentBalance: account.currentBalance,
          hasOverdueCycle: Boolean(overdue),
        },
        locked,
      );
      if (!settled.ok) return settled;
      const { priced, cycle, installments, balanceAfter, availableAfter } = settled.value;

      const cycleId = await openCycleFor(tx, data.storeId, account.id, cycle);
      if (!cycleId) return err('CYCLE_CLOSED' as const);

      const [sale] = await tx
        .insert(sales)
        .values({
          storeId: data.storeId,
          userIdCashier: data.cashierId,
          customerId: data.customerId,
          saleModality: installments ? 'INSTALLMENTS_CREDIT' : 'SINGLE_PAYMENT_CREDIT',
          paymentMethod: 'CREDIT',
          totalAmount: priced.total.toFixed2(),
          totalCost: priced.totalCost.toFixed2(),
          profitMargin: priced.profit.toFixed2(),
          saleDate: data.now,
          createdAt: data.now,
        })
        .returning({ id: sales.id });
      const saleId = sale!.id;
      await writeSaleLines(tx, {
        storeId: data.storeId,
        saleId,
        cashierId: data.cashierId,
        priced,
        now: data.now,
      });

      // US08 crit. 7: el cargo congela una copia de las tasas pactadas
      const { compensatory, moratory } = terms;
      const [charge] = await tx
        .insert(creditCharges)
        .values({
          storeId: data.storeId,
          creditAccountId: account.id,
          saleId,
          settlementCycleId: cycleId,
          chargeModality: installments ? 'INSTALLMENTS' : 'SINGLE_PAYMENT',
          purchaseDate: data.now,
          principalAmount: priced.total.toFixed2(),
          installmentsCount: installments?.rows.length ?? null,
          graceDays: installments?.graceDays ?? null,
          capitalizedAmount: installments?.capitalizedAmount.toFixed2() ?? null,
          compensatoryRateType: compensatory.type,
          compensatoryRateValue: compensatory.value,
          compensatoryPeriod: compensatory.period,
          compensatoryCapitalization: compensatory.capitalization,
          moratoryRateType: moratory.type,
          moratoryRateValue: moratory.value,
          moratoryPeriod: moratory.period,
          moratoryCapitalization: moratory.capitalization,
          createdAt: data.now,
          updatedAt: data.now,
        })
        .returning({ id: creditCharges.id });

      if (installments) {
        await tx.insert(creditInstallments).values(
          installments.rows.map((r) => ({
            storeId: data.storeId,
            creditChargeId: charge!.id,
            creditAccountId: account.id,
            installmentNumber: r.number,
            totalInstallments: installments.rows.length,
            dueDate: BusinessDate.endInstant(r.dueDate),
            initialBalance: r.initialBalance.toFixed2(),
            principalAmount: r.principal.toFixed2(),
            compensatoryInterest: r.interest.toFixed2(),
            totalInstallmentAmount: r.installment.toFixed2(),
            remainingBalance: r.finalBalance.toFixed2(),
            createdAt: data.now,
            updatedAt: data.now,
          })),
        );
      }

      await tx
        .update(creditAccounts)
        .set({ currentBalance: balanceAfter.toFixed2(), updatedAt: data.now })
        .where(eq(creditAccounts.id, account.id));

      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.cashierId,
        action: 'CREATE_CREDIT_SALE',
        entityName: 'sales',
        entityId: saleId,
        newData: {
          saleModality: installments ? 'INSTALLMENTS_CREDIT' : 'SINGLE_PAYMENT_CREDIT',
          totalAmount: priced.total.toFixed2(),
          customerId: data.customerId,
          creditAccountId: account.id,
          chargeId: charge!.id,
          installmentsCount: installments?.rows.length ?? null,
          balanceAfter: balanceAfter.toFixed2(),
        },
        createdAt: data.now,
      });

      return ok({
        saleId,
        total: priced.total.toFixed2(),
        balanceAfter: balanceAfter.toFixed2(),
        availableAfter: availableAfter.toFixed2(),
        installments: installments
          ? { count: installments.rows.length, amount: installments.installmentAmount.toFixed2() }
          : null,
      });
    });
  }
}
