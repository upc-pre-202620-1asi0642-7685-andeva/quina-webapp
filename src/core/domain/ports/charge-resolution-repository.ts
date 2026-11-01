import type { ObjectionError, VoidError } from '../credit/charge-resolution';
import type { Result } from '../shared/result';

export type ChargeNotFound = 'CHARGE_NOT_FOUND';

/**
 * Observaciones y anulaciones de cargos fiados (US11 crit. 4 y 7). Cada método
 * bloquea la cuenta del vecino y aplica las reglas de `charge-resolution` dentro
 * de una sola transacción.
 */
export interface ChargeResolutionRepository {
  /** El dueño o el empleado registran lo que el vecino reportó (decisión P4). */
  object(input: {
    storeId: string;
    chargeId: string;
    note: string;
    now: Date;
  }): Promise<Result<void, ObjectionError | ChargeNotFound>>;

  /** Solo el dueño: el cargo observado queda conforme con su nota. */
  confirm(input: {
    storeId: string;
    chargeId: string;
    userId: string;
    note: string;
    now: Date;
  }): Promise<Result<void, 'CHARGE_NOT_OBJECTED' | ChargeNotFound>>;

  /**
   * Solo el dueño: inserta la anulación, devuelve el stock, descuenta el ciclo
   * del cargo (P2) y baja la deuda del vecino.
   */
  void(input: {
    storeId: string;
    chargeId: string;
    userId: string;
    reason: string;
    now: Date;
  }): Promise<Result<{ voidedAmount: string }, VoidError | ChargeNotFound>>;
}
