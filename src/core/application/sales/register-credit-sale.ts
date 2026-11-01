import type { RegisteredCreditSale, SaleRepository } from '@/core/domain/ports/sale-repository';
import {
  settleCreditSale,
  type CreditPlan,
  type CreditSaleError as CreditSettlementError,
} from '@/core/domain/sales/credit-sale';
import type { CartLine } from '@/core/domain/sales/sale-pricing';
import { err, type Result } from '@/core/domain/shared/result';

export type RegisterCreditSaleCommand = {
  storeId: string;
  cashierId: string;
  customerId: string;
  cart: CartLine[];
  plan: CreditPlan;
  now: Date;
};

export type CreditSaleError =
  CreditSettlementError | { code: 'ACCOUNT_NOT_FOUND' | 'CYCLE_CLOSED' };

export class RegisterCreditSaleUseCase {
  constructor(private readonly sales: SaleRepository) {}

  /** US08: fiado al precio de crédito, dentro del límite y en el ciclo que toca. */
  async execute(
    command: RegisterCreditSaleCommand,
  ): Promise<Result<RegisteredCreditSale, CreditSaleError>> {
    const result = await this.sales.registerCredit<CreditSettlementError>({
      storeId: command.storeId,
      cashierId: command.cashierId,
      customerId: command.customerId,
      cart: command.cart,
      now: command.now,
      settle: (account, products) =>
        settleCreditSale({
          cart: command.cart,
          products,
          account,
          plan: command.plan,
          now: command.now,
        }),
    });
    if (!result.ok && typeof result.error === 'string') return err({ code: result.error });
    return result as Result<RegisteredCreditSale, CreditSaleError>;
  }
}
