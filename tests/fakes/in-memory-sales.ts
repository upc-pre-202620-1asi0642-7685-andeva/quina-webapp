import type {
  CashSettlement,
  CreditSaleRepositoryError,
  RegisterCashSaleData,
  RegisterCreditSaleData,
  RegisteredCreditSale,
  RegisteredSale,
  SaleRepository,
} from '@/core/domain/ports/sale-repository';
import type { CreditAccountSnapshot, CreditSettlement } from '@/core/domain/sales/credit-sale';
import type { SaleProduct } from '@/core/domain/sales/sale-pricing';
import { err, ok, type Result } from '@/core/domain/shared/result';
import type { InMemoryCatalog } from './in-memory-catalog';

export type FakeSale = {
  storeId: string;
  cashierId: string;
  customerId: string | null;
} & (
  | { modality: 'CASH'; settlement: CashSettlement }
  | { modality: 'CREDIT'; settlement: CreditSettlement }
);

/** Ventas en memoria sobre el catálogo en memoria: mismo contrato que Drizzle. */
export class InMemorySales implements SaleRepository {
  readonly sales = new Map<string, FakeSale>();
  readonly customers = new Set<string>();
  averageCosts = new Map<string, string>();
  /** Cuentas de fiado por id de vecino. */
  readonly accounts = new Map<string, CreditAccountSnapshot>();
  /** Ciclos ya liquidados, como `cuenta:año-mes`. */
  readonly closedCycles = new Set<string>();
  private nextId = 1;

  constructor(private readonly catalog: InMemoryCatalog) {}

  async registerCash<E>(
    data: RegisterCashSaleData<E>,
  ): Promise<Result<RegisteredSale, E | 'CUSTOMER_NOT_FOUND'>> {
    if (data.customerId && !this.customers.has(data.customerId)) return err('CUSTOMER_NOT_FOUND');
    const settled = data.settle(this.productsOf(data.storeId));
    if (!settled.ok) return settled;
    const { priced, payment } = settled.value;
    this.applyStock(priced.lines);
    const saleId = `s-${this.nextId++}`;
    this.sales.set(saleId, {
      storeId: data.storeId,
      cashierId: data.cashierId,
      customerId: data.customerId,
      modality: 'CASH',
      settlement: settled.value,
    });
    return ok({
      saleId,
      total: priced.total.toFixed2(),
      changeGiven: payment.changeGiven?.toFixed2() ?? null,
    });
  }

  async registerCredit<E>(
    data: RegisterCreditSaleData<E>,
  ): Promise<Result<RegisteredCreditSale, E | CreditSaleRepositoryError>> {
    const account = this.accounts.get(data.customerId);
    if (!account) return err('ACCOUNT_NOT_FOUND');
    const settled = data.settle(account, this.productsOf(data.storeId));
    if (!settled.ok) return settled;
    const { priced, cycle, installments, balanceAfter, availableAfter } = settled.value;
    if (this.closedCycles.has(`${account.id}:${cycle.periodYear}-${cycle.periodMonth}`)) {
      return err('CYCLE_CLOSED');
    }
    this.applyStock(priced.lines);
    account.currentBalance = balanceAfter.toFixed2();
    const saleId = `s-${this.nextId++}`;
    this.sales.set(saleId, {
      storeId: data.storeId,
      cashierId: data.cashierId,
      customerId: data.customerId,
      modality: 'CREDIT',
      settlement: settled.value,
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
  }

  private applyStock(lines: CashSettlement['priced']['lines']) {
    for (const line of lines) {
      const product = this.catalog.products.get(line.productId)!;
      if (line.stockAfter !== null) {
        product.stock = line.stockAfter;
        this.catalog.movements.push({
          productId: line.productId,
          quantity: `-${line.quantity}`,
          notes: null,
        });
      }
    }
  }

  private productsOf(storeId: string): SaleProduct[] {
    const units = this.catalog.unitsByStore.get(storeId) ?? [];
    return [...this.catalog.products]
      .filter(([, p]) => p.storeId === storeId)
      .map(([id, p]) => ({
        id,
        name: p.details.name,
        isService: p.details.isService,
        isActive: p.active,
        allowDecimals: units.find((u) => u.id === p.details.unitId)?.allowDecimals ?? false,
        allowsInstallments: p.details.allowsInstallments,
        currentStock: p.stock,
        cashPrice: p.prices.cash,
        creditPrice: p.prices.credit,
        currentAverageCost: this.averageCosts.get(id) ?? '0.0000',
      }));
  }
}
