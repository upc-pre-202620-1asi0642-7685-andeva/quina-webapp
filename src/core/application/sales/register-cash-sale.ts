import type { RegisteredSale, SaleRepository } from '@/core/domain/ports/sale-repository';
import {
  settleCashPayment,
  type CashPaymentError,
  type CashPaymentMethod,
} from '@/core/domain/sales/cash-payment';
import { priceSale, type CartLine, type SalePricingError } from '@/core/domain/sales/sale-pricing';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type RegisterCashSaleCommand = {
  storeId: string;
  cashierId: string;
  customerId: string | null;
  cart: CartLine[];
  paymentMethod: CashPaymentMethod;
  amountReceived: string;
  now: Date;
};

export type CashSaleError =
  SalePricingError | { code: CashPaymentError } | { code: 'CUSTOMER_NOT_FOUND' };

export class RegisterCashSaleUseCase {
  constructor(private readonly sales: SaleRepository) {}

  /** US07: venta al contado al precio de contado, con vuelto y salida de stock. */
  async execute(command: RegisterCashSaleCommand): Promise<Result<RegisteredSale, CashSaleError>> {
    const result = await this.sales.registerCash<CashSaleError>({
      storeId: command.storeId,
      cashierId: command.cashierId,
      customerId: command.customerId,
      cart: command.cart,
      now: command.now,
      settle: (products) => {
        const priced = priceSale(command.cart, products, 'CASH');
        if (!priced.ok) return priced;
        const payment = settleCashPayment(
          priced.value.total,
          command.paymentMethod,
          command.amountReceived,
        );
        if (!payment.ok) return err({ code: payment.error });
        return ok({ priced: priced.value, payment: payment.value });
      },
    });
    if (!result.ok && result.error === 'CUSTOMER_NOT_FOUND') {
      return err({ code: 'CUSTOMER_NOT_FOUND' });
    }
    return result as Result<RegisteredSale, CashSaleError>;
  }
}
