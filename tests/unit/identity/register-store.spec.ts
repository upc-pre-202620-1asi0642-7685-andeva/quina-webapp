import { beforeEach, describe, expect, it } from 'vitest';
import {
  RegisterStoreUseCase,
  type RegisterStoreInput,
} from '@/core/application/identity/register-store';
import { InMemoryStoreRegistrationRepository } from '../../fakes/in-memory-store-registration-repository';

const now = new Date('2026-10-30T12:00:00.000Z');

function input(overrides: Partial<RegisterStoreInput> = {}): RegisterStoreInput {
  return {
    userId: 'user-1',
    commercialName: '  Bodega Doña Rosa ',
    businessTurn: 'BODEGA',
    taxId: '20 123456789',
    ownerFullName: 'Rosa Quispe',
    contactEmail: ' Rosa@Example.COM ',
    now,
    ...overrides,
  };
}

describe('RegisterStoreUseCase', () => {
  let repo: InMemoryStoreRegistrationRepository;
  let useCase: RegisterStoreUseCase;

  beforeEach(() => {
    repo = new InMemoryStoreRegistrationRepository();
    repo.addUser('user-1');
    repo.addUser('user-2');
    useCase = new RegisterStoreUseCase(repo);
  });

  it('crea la tienda con datos normalizados y prueba de 14 días exactos', async () => {
    const result = await useCase.execute(input());
    expect(result.ok).toBe(true);
    const saved = repo.stores[0]!;
    expect(saved.commercialName).toBe('Bodega Doña Rosa');
    expect(saved.contactEmail).toBe('rosa@example.com');
    expect(saved.taxIdType).toBe('RUC');
    expect(saved.taxIdNumber).toBe('20123456789');
    expect(saved.trialEndsAt.getTime()).toBe(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(repo.users.get('user-1')).toEqual({ role: 'STORE_OWNER', storeId: saved.storeId });
    if (result.ok) expect(result.value.storeId).toBe(saved.storeId);
  });

  it('RUC duplicado devuelve TAX_ID_TAKEN', async () => {
    await useCase.execute(input());
    const result = await useCase.execute(
      input({ userId: 'user-2', contactEmail: 'otro@example.com' }),
    );
    expect(result).toEqual({ ok: false, error: 'TAX_ID_TAKEN' });
  });

  it('correo de contacto duplicado devuelve EMAIL_TAKEN', async () => {
    await useCase.execute(input());
    const result = await useCase.execute(input({ userId: 'user-2', taxId: '20987654321' }));
    expect(result).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });

  it('un usuario que ya es dueño recibe su mismo storeId', async () => {
    const first = await useCase.execute(input());
    const second = await useCase.execute(input({ taxId: '20987654321' }));
    expect(second).toEqual(first);
    expect(repo.stores).toHaveLength(1);
  });

  it('TaxId inválido devuelve TAX_ID_INVALID sin tocar el repositorio', async () => {
    const result = await useCase.execute(input({ taxId: '123' }));
    expect(result).toEqual({ ok: false, error: 'TAX_ID_INVALID' });
    expect(repo.stores).toHaveLength(0);
  });

  it('un usuario que no es PENDING_OWNER devuelve USER_NOT_PENDING', async () => {
    repo.addUser('customer', 'CUSTOMER');
    const result = await useCase.execute(input({ userId: 'customer' }));
    expect(result).toEqual({ ok: false, error: 'USER_NOT_PENDING' });
  });
});
