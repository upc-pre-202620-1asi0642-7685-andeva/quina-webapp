import { describe, expect, it, vi } from 'vitest';
import { RegisterPaymentUseCase } from '@/core/application/collections/register-payment';
import type { PaymentRepository } from '@/core/domain/ports/payment-repository';
import { err, ok } from '@/core/domain/shared/result';

const command = {
  storeId: 's',
  customerId: 'c',
  collectorId: 'u',
  cycleId: 'y',
  amount: '50.42',
  method: 'YAPE' as const,
  amountReceived: '',
  now: new Date(),
};

const registered = {
  paymentId: 'p',
  receiptNumber: 'R-000001',
  amountPaid: '50.42',
  changeGiven: null,
  receiptLogId: 'log',
};

function repo(result: Awaited<ReturnType<PaymentRepository['register']>>): PaymentRepository {
  return { preview: vi.fn(), register: async () => result };
}

describe('RegisterPaymentUseCase', () => {
  it('manda el comprobante después de registrar el pago (US13 crit. 6)', async () => {
    const send = vi.fn(async () => 'SENT');
    const result = await new RegisterPaymentUseCase(repo(ok(registered)), send).execute(command);
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledWith('s', 'log');
  });

  it('el cobro no falla si falla el correo (D10)', async () => {
    const send = vi.fn(async () => {
      throw new Error('Resend caído');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await new RegisterPaymentUseCase(repo(ok(registered)), send).execute(command);
    expect(result).toEqual(ok(registered));
  });

  it('no manda nada si el cobro se rechaza', async () => {
    const send = vi.fn();
    const result = await new RegisterPaymentUseCase(
      repo(err('PARTIAL_PAYMENT_NOT_ALLOWED')),
      send,
    ).execute(command);
    expect(result).toEqual(err('PARTIAL_PAYMENT_NOT_ALLOWED'));
    expect(send).not.toHaveBeenCalled();
  });
});
