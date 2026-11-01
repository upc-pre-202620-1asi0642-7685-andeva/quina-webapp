import type {
  DebtPaymentMethod,
  PaymentError,
  PaymentRepository,
  RegisteredPayment,
} from '@/core/domain/ports/payment-repository';
import type { Result } from '@/core/domain/shared/result';

export type RegisterPaymentCommand = {
  storeId: string;
  customerId: string;
  collectorId: string;
  cycleId: string;
  amount: string;
  method: DebtPaymentMethod;
  amountReceived: string;
  now: Date;
};

/** Envía un correo ya en cola; nunca debe tumbar el cobro (D10). */
export type ReceiptSender = (storeId: string, logId: string) => Promise<unknown>;

/** US13: cobra el ciclo completo con su mora y manda el comprobante después del commit. */
export class RegisterPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly sendReceipt: ReceiptSender,
  ) {}

  async execute(command: RegisterPaymentCommand): Promise<Result<RegisteredPayment, PaymentError>> {
    const result = await this.payments.register(command);
    if (result.ok && result.value.receiptLogId) {
      try {
        await this.sendReceipt(command.storeId, result.value.receiptLogId);
      } catch (error) {
        // Queda en cola: el proceso diario lo reintenta (D10)
        console.error('RegisterPaymentUseCase.sendReceipt', error);
      }
    }
    return result;
  }
}
