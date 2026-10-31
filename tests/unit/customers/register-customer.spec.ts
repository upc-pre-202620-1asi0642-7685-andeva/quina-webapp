import { beforeEach, describe, expect, it } from 'vitest';
import {
  RegisterCustomerUseCase,
  type RegisterCustomerCommand,
} from '@/core/application/customers/register-customer';
import {
  SetCustomerActiveUseCase,
  UpdateCustomerUseCase,
} from '@/core/application/customers/update-customer';
import { CUSTOMER_PRIVACY_VERSION } from '@/core/domain/credit/customer-consent';
import {
  FakeNotificationMailer,
  InMemoryCustomerStore,
} from '../../fakes/in-memory-customer-repositories';

const NOW = new Date('2026-11-15T15:00:00Z');

function command(overrides: Partial<RegisterCustomerCommand> = {}): RegisterCustomerCommand {
  return {
    storeId: 's-1',
    storeName: 'Bodega Don Lucho',
    storeLocale: 'es',
    actorId: 'u-1',
    profile: {
      documentType: 'DNI',
      documentNumber: '45678901',
      firstName: 'Rosa',
      lastName: 'Quispe Mamani',
      phone: '+51 987 654 321',
      email: 'Rosa@Correo.PE',
      address: ' Jr. Los Olivos 123 ',
      preferredLocale: null,
    },
    consentAccepted: true,
    consentText: 'Autorizo a Bodega Don Lucho…',
    ip: '203.0.113.5',
    userAgent: 'Mozilla/5.0',
    privacyUrl: 'https://quina.andeva.tech/app/privacy/customers/s-1',
    now: NOW,
    ...overrides,
  };
}

describe('RegisterCustomerUseCase (US04)', () => {
  let store: InMemoryCustomerStore;
  let mailer: FakeNotificationMailer;
  let useCase: RegisterCustomerUseCase;

  beforeEach(() => {
    store = new InMemoryCustomerStore();
    mailer = new FakeNotificationMailer();
    useCase = new RegisterCustomerUseCase(store, mailer);
  });

  it('registra al vecino con datos normalizados y su consentimiento versionado (crit. 1 y 4)', async () => {
    const result = await useCase.execute(command());
    expect(result).toEqual({ ok: true, value: { customerId: 'c-1', welcomeSent: true } });
    expect(store.customers.get('c-1')?.profile).toMatchObject({
      phone: '987654321',
      email: 'rosa@correo.pe',
      address: 'Jr. Los Olivos 123',
    });
    expect(store.consents).toEqual([
      expect.objectContaining({
        customerId: 'c-1',
        type: 'DATA_PROTECTION_LAW_29733',
        version: CUSTOMER_PRIVACY_VERSION,
        text: 'Autorizo a Bodega Don Lucho…',
        ip: '203.0.113.5',
      }),
    ]);
  });

  it('no registra sin la casilla de consentimiento (crit. 3)', async () => {
    expect(await useCase.execute(command({ consentAccepted: false }))).toEqual({
      ok: false,
      error: 'CONSENT_REQUIRED',
    });
    expect(store.customers.size).toBe(0);
  });

  it('rechaza el mismo documento dos veces en la tienda, pero no en otra (crit. 5)', async () => {
    await useCase.execute(command());
    expect(await useCase.execute(command())).toEqual({ ok: false, error: 'DOCUMENT_TAKEN' });
    expect((await useCase.execute(command({ storeId: 's-2' }))).ok).toBe(true);
  });

  it('valida documento, nombres, celular y correo (crit. 1)', async () => {
    const cases = [
      [{ documentNumber: '123' }, 'DOCUMENT_INVALID'],
      [{ firstName: 'R0sa' }, 'FIRST_NAME_INVALID'],
      [{ lastName: '' }, 'LAST_NAME_INVALID'],
      [{ phone: '012345678' }, 'PHONE_INVALID'],
      [{ email: 'rosa@' }, 'EMAIL_INVALID'],
    ] as const;
    for (const [profile, error] of cases) {
      const result = await useCase.execute(
        command({ profile: { ...command().profile, ...profile } }),
      );
      expect(result).toEqual({ ok: false, error });
    }
  });

  it('envía la bienvenida en el idioma del vecino o el de la tienda (crit. 6, US27)', async () => {
    await useCase.execute(command({ storeLocale: 'qu' }));
    await useCase.execute(
      command({
        profile: { ...command().profile, documentNumber: '45678902', preferredLocale: 'en' },
      }),
    );
    expect(mailer.sent.map((m) => (m.data as { locale: string }).locale)).toEqual(['qu', 'en']);
    expect(mailer.sent[0]?.context).toEqual({ storeId: 's-1', customerId: 'c-1' });
  });

  it('si el correo falla, el vecino queda registrado igual', async () => {
    mailer.failing = true;
    const result = await useCase.execute(command());
    expect(result).toEqual({ ok: true, value: { customerId: 'c-1', welcomeSent: false } });
    expect(store.customers.size).toBe(1);
  });
});

describe('UpdateCustomerUseCase y SetCustomerActiveUseCase', () => {
  it('no permite cambiar al documento de otro vecino de la tienda', async () => {
    const store = new InMemoryCustomerStore();
    const register = new RegisterCustomerUseCase(store, new FakeNotificationMailer());
    await register.execute(command());
    await register.execute(
      command({ profile: { ...command().profile, documentNumber: '45678902' } }),
    );
    const update = new UpdateCustomerUseCase(store);
    const result = await update.execute({
      storeId: 's-1',
      actorId: 'u-1',
      customerId: 'c-2',
      profile: command().profile,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: 'DOCUMENT_TAKEN' });
  });

  it('no da de baja a un vecino con saldo y suspende la cuenta del que no debe (D5)', async () => {
    const store = new InMemoryCustomerStore();
    await new RegisterCustomerUseCase(store, new FakeNotificationMailer()).execute(command());
    store.accounts.set('c-1', {
      storeId: 's-1',
      terms: {} as never,
      status: 'ACTIVE',
      balance: '12.50',
    });
    const deactivate = new SetCustomerActiveUseCase(store);
    const input = { storeId: 's-1', actorId: 'u-1', customerId: 'c-1', active: false, now: NOW };
    expect(await deactivate.execute(input)).toEqual({ ok: false, error: 'HAS_BALANCE' });

    store.accounts.get('c-1')!.balance = '0.00';
    expect((await deactivate.execute(input)).ok).toBe(true);
    expect(store.accounts.get('c-1')?.status).toBe('SUSPENDED');
  });
});
