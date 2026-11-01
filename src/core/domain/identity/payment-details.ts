import { MobilePhone } from '@/core/domain/identity/mobile-phone';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Datos que la tienda muestra al vecino para que le pague (US14.6, Plan 5 P3). Todos opcionales. */
export type PaymentDetails = {
  yapeNumber: string | null;
  plinNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankCci: string | null;
};

export type PaymentDetailsField = keyof PaymentDetails;
export type PaymentDetailsError = { field: PaymentDetailsField; error: 'INVALID' };

const blank = (raw: string | undefined) => (raw ?? '').trim() || null;

export const PaymentDetails = {
  /** Yape y Plin son celulares; el CCI tiene 20 dígitos; banco ≤ 60 y cuenta ≤ 30 (columnas de `stores`). */
  parse(
    raw: Partial<Record<PaymentDetailsField, string>>,
  ): Result<PaymentDetails, PaymentDetailsError> {
    const result: PaymentDetails = {
      yapeNumber: null,
      plinNumber: null,
      bankName: blank(raw.bankName),
      bankAccountNumber: blank(raw.bankAccountNumber)?.replace(/\s+/g, '') ?? null,
      bankCci: blank(raw.bankCci)?.replace(/[\s-]/g, '') ?? null,
    };
    for (const field of ['yapeNumber', 'plinNumber'] as const) {
      const value = blank(raw[field]);
      if (!value) continue;
      const phone = MobilePhone.parse(value);
      if (!phone.ok) return err({ field, error: 'INVALID' });
      result[field] = phone.value;
    }
    if (result.bankName && result.bankName.length > 60)
      return err({ field: 'bankName', error: 'INVALID' });
    if (result.bankAccountNumber && !/^[0-9-]{6,30}$/.test(result.bankAccountNumber)) {
      return err({ field: 'bankAccountNumber', error: 'INVALID' });
    }
    if (result.bankCci && !/^\d{20}$/.test(result.bankCci))
      return err({ field: 'bankCci', error: 'INVALID' });
    // Una cuenta sin banco no le sirve al vecino
    if ((result.bankAccountNumber || result.bankCci) && !result.bankName) {
      return err({ field: 'bankName', error: 'INVALID' });
    }
    return ok(result);
  },
};
