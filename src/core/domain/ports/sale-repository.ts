import type { Result } from '../shared/result';
import type { CashPayment } from '../sales/cash-payment';
import type { CreditAccountSnapshot, CreditSettlement } from '../sales/credit-sale';
import type { CartLine, PricedSale, SaleProduct } from '../sales/sale-pricing';

export type CashSettlement = { priced: PricedSale; payment: CashPayment };

/**
 * Calcula la venta con los productos ya bloqueados (FOR UPDATE). El repositorio
 * la llama dentro de la transacción: precio y stock no cambian entre leer y vender.
 */
export type SettleCashSale<E> = (products: SaleProduct[]) => Result<CashSettlement, E>;

export type RegisterCashSaleData<E> = {
  storeId: string;
  /** Sale de la sesión verificada (US05 crit. 6), nunca del formulario. */
  cashierId: string;
  /** Opcional: la venta al contado admite cliente anónimo (US07 crit. 1). */
  customerId: string | null;
  cart: CartLine[];
  settle: SettleCashSale<E>;
  now: Date;
};

export type RegisteredSale = { saleId: string; total: string; changeGiven: string | null };

/**
 * Calcula el fiado con la cuenta del vecino y los productos ya bloqueados (D14):
 * límite, ciclo y stock no cambian entre leer y vender.
 */
export type SettleCreditSale<E> = (
  account: CreditAccountSnapshot,
  products: SaleProduct[],
) => Result<CreditSettlement, E>;

export type RegisterCreditSaleData<E> = {
  storeId: string;
  /** Sale de la sesión verificada (US05 crit. 6), nunca del formulario. */
  cashierId: string;
  customerId: string;
  cart: CartLine[];
  settle: SettleCreditSale<E>;
  now: Date;
};

export type RegisteredCreditSale = {
  saleId: string;
  total: string;
  balanceAfter: string;
  availableAfter: string;
  installments: { count: number; amount: string } | null;
};

/** El vecino no tiene cuenta de fiado, o el ciclo de la compra ya se liquidó (D8). */
export type CreditSaleRepositoryError = 'ACCOUNT_NOT_FOUND' | 'CYCLE_CLOSED';

export interface SaleRepository {
  /** Inserta venta, ítems y kardex y descuenta el stock en una sola transacción. */
  registerCash<E>(
    data: RegisterCashSaleData<E>,
  ): Promise<Result<RegisteredSale, E | 'CUSTOMER_NOT_FOUND'>>;

  /**
   * Además de la venta: busca o abre el ciclo, crea el cargo con copia de las
   * tasas, sus cuotas si las hay, y suma el capital a la deuda del vecino.
   */
  registerCredit<E>(
    data: RegisterCreditSaleData<E>,
  ): Promise<Result<RegisteredCreditSale, E | CreditSaleRepositoryError>>;
}
