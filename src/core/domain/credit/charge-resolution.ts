import type { CycleStatus } from '@/core/domain/credit/debt-payment';
import type { Money } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type ChargeStatus = 'PENDING' | 'BILLED' | 'PAID' | 'VOIDED';
export type ConsentStatus = 'PENDING' | 'ACCEPTED' | 'OBJECTED';

/** Lo que las reglas de conformidad necesitan de un cargo (`credit_charges`). */
export type ResolvableCharge = {
  modality: 'SINGLE_PAYMENT' | 'INSTALLMENTS';
  status: ChargeStatus;
  consentStatus: ConsentStatus;
  /** 48 h después del resumen diario; null si todavía no se notificó. */
  consentDeadline: Date | null;
  /** Capital de la compra a precio de crédito. */
  principal: Money;
  /** Interés compensatorio liquidado en el corte (null mientras el ciclo esté abierto). */
  liquidatedInterest: Money | null;
  /** Estado del ciclo al que pertenece el cargo. */
  cycleStatus: CycleStatus;
  /** Solo cuotas: ¿alguna cuota ya entró en un corte? */
  anyInstallmentBilled: boolean;
};

export type ObjectionError = 'CHARGE_NOT_PENDING' | 'OBJECTION_WINDOW_CLOSED';

/**
 * El vecino observa un cargo ("yo no saqué eso") dentro de sus 48 h; mientras
 * no haya portal (Plan 5), el dueño o el empleado lo registran por él (US11.4,
 * decisión P4).
 */
export function objectCharge(charge: ResolvableCharge, now: Date): Result<void, ObjectionError> {
  if (
    charge.consentStatus !== 'PENDING' ||
    charge.status === 'PAID' ||
    charge.status === 'VOIDED'
  ) {
    return err('CHARGE_NOT_PENDING');
  }
  if (charge.consentDeadline && now.getTime() > charge.consentDeadline.getTime()) {
    return err('OBJECTION_WINDOW_CLOSED');
  }
  return ok(undefined);
}

/** El dueño confirma un cargo observado: pasa a conforme con su nota (US11.7). */
export function confirmCharge(charge: ResolvableCharge): Result<void, 'CHARGE_NOT_OBJECTED'> {
  return charge.consentStatus === 'OBJECTED' && charge.status !== 'VOIDED'
    ? ok(undefined)
    : err('CHARGE_NOT_OBJECTED');
}

export type VoidError =
  | 'CHARGE_NOT_OBJECTED'
  | 'CHARGE_ALREADY_VOIDED'
  | 'CHARGE_HAS_PAYMENTS'
  | 'INSTALLMENT_ALREADY_BILLED';

export type VoidPlan = {
  /** `credit_charge_voids.voided_amount`: capital más el interés ya liquidado. */
  readonly voidedAmount: Money;
  /** Lo que baja `current_balance`. */
  readonly balanceDecrease: Money;
  /** El ciclo ya estaba liquidado: hay que recalcular sus totales (P2). */
  readonly recalculateCycle: boolean;
};

/**
 * El dueño anula un cargo observado. Se descuenta del ciclo del propio cargo
 * mientras no esté pagado (P2). Un cargo en cuotas se anula entero solo si
 * ninguna cuota se liquidó (P3); como ninguna estaba en un ciclo, no hay
 * totales que recalcular.
 */
export function planVoid(charge: ResolvableCharge): Result<VoidPlan, VoidError> {
  if (charge.status === 'VOIDED') return err('CHARGE_ALREADY_VOIDED');
  if (charge.consentStatus !== 'OBJECTED') return err('CHARGE_NOT_OBJECTED');
  if (charge.status === 'PAID') return err('CHARGE_HAS_PAYMENTS');

  // La compra en cuotas no se cobra en su ciclo (que puede cerrar en cero y
  // quedar pagado, D12): lo que importa es si alguna cuota ya se liquidó
  if (charge.modality === 'INSTALLMENTS') {
    if (charge.anyInstallmentBilled) return err('INSTALLMENT_ALREADY_BILLED');
    return ok(
      Object.freeze({
        voidedAmount: charge.principal,
        balanceDecrease: charge.principal,
        recalculateCycle: false,
      }),
    );
  }

  if (charge.cycleStatus === 'PAID') return err('CHARGE_HAS_PAYMENTS');
  const billed = charge.cycleStatus !== 'OPEN';
  const amount =
    billed && charge.liquidatedInterest
      ? charge.principal.plus(charge.liquidatedInterest)
      : charge.principal;
  return ok(
    Object.freeze({ voidedAmount: amount, balanceDecrease: amount, recalculateCycle: billed }),
  );
}

/** Un cargo observado sin resolver bloquea el cobro de su ciclo (D8). */
export function blocksPayment(charges: readonly ResolvableCharge[]): boolean {
  return charges.some((c) => c.consentStatus === 'OBJECTED' && c.status !== 'VOIDED');
}
