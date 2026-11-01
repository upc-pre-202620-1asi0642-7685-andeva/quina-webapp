import type { PaymentAmountError, PaymentQuoteError } from '../credit/debt-payment';
import type { CashPaymentError } from '../sales/cash-payment';
import type { Currency } from '../shared/money';
import type { Result } from '../shared/result';

/** Medios para pagar un ciclo (`debt_payments.payment_method`). */
export const DEBT_PAYMENT_METHODS = ['CASH', 'YAPE', 'PLIN', 'TRANSFER'] as const;
export type DebtPaymentMethod = (typeof DEBT_PAYMENT_METHODS)[number];

/** Cargo observado sin resolver que frena el cobro (D8). */
export type PendingObjection = { chargeId: string; cycleId: string; purchaseDate: Date };

/** Lo que muestra la pantalla de cobro antes de cobrar (US13). */
export type PaymentPreview = {
  accountId: string;
  currency: Currency;
  cycle: {
    id: string;
    cycleNumber: number;
    status: 'BILLED' | 'OVERDUE';
    cutOffDate: Date;
    paymentDueDate: Date;
  };
  totalDue: string;
  daysLate: number;
  moratoryInterest: string;
  /** Lo único que se acepta: el ciclo completo más su mora (US13 crit. 4). */
  amountDue: string;
  objections: PendingObjection[];
  /** Ciclos por pagar después de este (D6). */
  laterCycles: number;
};

export type RegisteredPayment = {
  paymentId: string;
  receiptNumber: string;
  amountPaid: string;
  changeGiven: string | null;
  /** Fila del comprobante en cola; se envía después del commit (D10). */
  receiptLogId: string | null;
};

export type PaymentError =
  | 'ACCOUNT_NOT_FOUND'
  | 'NO_PAYABLE_CYCLE'
  | 'CYCLE_NOT_OLDEST'
  | 'OBJECTION_PENDING'
  | 'SETTLEMENT_MISMATCH'
  | PaymentQuoteError
  | PaymentAmountError
  | CashPaymentError;

export interface PaymentRepository {
  preview(input: {
    storeId: string;
    customerId: string;
    now: Date;
  }): Promise<Result<PaymentPreview, PaymentError>>;

  /**
   * Cobra el ciclo más antiguo con la cuenta bloqueada: recotiza con la hora del
   * servidor, exige el monto exacto y deja recibo, reparto, ciclo y saldo al día.
   */
  register(input: {
    storeId: string;
    customerId: string;
    collectorId: string;
    cycleId: string;
    amount: string;
    method: DebtPaymentMethod;
    /** Solo efectivo: lo que entregó el vecino, para el vuelto. */
    amountReceived: string;
    now: Date;
  }): Promise<Result<RegisteredPayment, PaymentError>>;
}
