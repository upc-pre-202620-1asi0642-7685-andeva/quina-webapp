import { describe, expect, it } from 'vitest';
import { ResolveChargeUseCase } from '@/core/application/collections/resolve-charge';
import type { ChargeResolutionRepository } from '@/core/domain/ports/charge-resolution-repository';
import { ok } from '@/core/domain/shared/result';

function recorder() {
  const calls: { method: string; note: string }[] = [];
  const repo: ChargeResolutionRepository = {
    object: async (input) => (calls.push({ method: 'object', note: input.note }), ok(undefined)),
    confirm: async (input) => (calls.push({ method: 'confirm', note: input.note }), ok(undefined)),
    void: async (input) => (
      calls.push({ method: 'void', note: input.reason }),
      ok({ voidedAmount: '10.00' })
    ),
  };
  return { calls, useCase: new ResolveChargeUseCase(repo) };
}

const base = { storeId: 's', chargeId: 'c', userId: 'u', now: new Date() };

describe('ResolveChargeUseCase', () => {
  it('exige una nota y no llama al repositorio si viene vacía', async () => {
    const { calls, useCase } = recorder();
    expect(await useCase.object({ ...base, note: '   ' })).toEqual({
      ok: false,
      error: 'NOTE_REQUIRED',
    });
    expect(await useCase.confirm({ ...base, note: '' })).toEqual({
      ok: false,
      error: 'NOTE_REQUIRED',
    });
    expect(await useCase.void({ ...base, reason: '\n' })).toEqual({
      ok: false,
      error: 'NOTE_REQUIRED',
    });
    expect(calls).toEqual([]);
  });

  it('limpia los espacios de la nota antes de guardarla', async () => {
    const { calls, useCase } = recorder();
    await useCase.object({ ...base, note: '  no saqué   el  arroz ' });
    await useCase.void({ ...base, reason: 'cobro  doble' });
    expect(calls).toEqual([
      { method: 'object', note: 'no saqué el arroz' },
      { method: 'void', note: 'cobro doble' },
    ]);
  });
});
