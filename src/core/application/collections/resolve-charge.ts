import type { ObjectionError, VoidError } from '@/core/domain/credit/charge-resolution';
import type {
  ChargeNotFound,
  ChargeResolutionRepository,
} from '@/core/domain/ports/charge-resolution-repository';
import { err, type Result } from '@/core/domain/shared/result';

export const NOTE_MAX = 500;

type NoteError = 'NOTE_REQUIRED';

/** Las notas son lo que el dueño leerá después: sin espacios sobrantes y nunca vacías. */
function cleanNote(raw: string): string | null {
  const note = raw.trim().replace(/\s+/g, ' ');
  return note.length === 0 ? null : note.slice(0, NOTE_MAX);
}

/** US11 crit. 4 y 7: observar, confirmar y anular un cargo fiado. */
export class ResolveChargeUseCase {
  constructor(private readonly charges: ChargeResolutionRepository) {}

  object(command: {
    storeId: string;
    chargeId: string;
    note: string;
    now: Date;
  }): Promise<Result<void, ObjectionError | ChargeNotFound | NoteError>> {
    const note = cleanNote(command.note);
    if (!note) return Promise.resolve(err('NOTE_REQUIRED'));
    return this.charges.object({ ...command, note });
  }

  confirm(command: {
    storeId: string;
    chargeId: string;
    userId: string;
    note: string;
    now: Date;
  }): Promise<Result<void, 'CHARGE_NOT_OBJECTED' | ChargeNotFound | NoteError>> {
    const note = cleanNote(command.note);
    if (!note) return Promise.resolve(err('NOTE_REQUIRED'));
    return this.charges.confirm({ ...command, note });
  }

  void(command: {
    storeId: string;
    chargeId: string;
    userId: string;
    reason: string;
    now: Date;
  }): Promise<Result<{ voidedAmount: string }, VoidError | ChargeNotFound | NoteError>> {
    const reason = cleanNote(command.reason);
    if (!reason) return Promise.resolve(err('NOTE_REQUIRED'));
    return this.charges.void({ ...command, reason });
  }
}
