import { describe, expect, it } from 'vitest';
import type { PortalAccount } from '@/infrastructure/db/queries/portal';
import {
  buildPortalNotifications,
  type PortalChargeAlert,
  type PortalNotificationMessages,
} from '@/presentation/queries/portal-notifications';

const m: PortalNotificationMessages = {
  overdueTitle: ({ store }) => `Pago vencido en ${store}`,
  overdueBody: ({ amount, date }) => `${amount} · venció el ${date}`,
  dueSoonTitle: ({ store }) => `Tu pago vence pronto en ${store}`,
  dueSoonBody: ({ amount, date }) => `${amount} · vence el ${date}`,
  billedTitle: ({ store }) => `Estado de cuenta listo en ${store}`,
  billedBody: ({ amount, date }) => `${amount} · paga hasta el ${date}`,
  pendingChargeTitle: ({ store }) => `Compra por confirmar en ${store}`,
  pendingChargeBody: ({ amount, date }) => `${amount} · puedes revisarla hasta el ${date}`,
  objectedChargeTitle: ({ store }) => `Observación en revisión en ${store}`,
  objectedChargeBody: ({ amount }) => `${amount} · la tienda lo está revisando`,
  blockedTitle: ({ store }) => `Cuenta pausada en ${store}`,
  blockedBody: () => 'Habla con tu casero para volver a fiar.',
  bouncedTitle: ({ store }) => `Correo sin entrega en ${store}`,
  bouncedBody: () => 'Pide a la tienda que revise tu correo registrado.',
};

function makeAccount(overrides: Partial<PortalAccount> = {}): PortalAccount {
  return {
    storeId: 'store-1',
    storeName: 'Bodega Don Lucho',
    storeContact: '987654321',
    storeAddress: 'Av. Perú 123',
    customerId: 'cust-1',
    customerName: 'Rosa',
    emailBouncedAt: null,
    account: {
      id: 'acc-1',
      currency: 'PEN',
      balance: '50.00',
      creditLimit: '200.00',
      availableCredit: '150.00',
      overLimit: false,
      usedPercent: 25,
      status: 'ACTIVE',
      cutOffDay: 25,
      paymentDueDay: 5,
      nextCutOffDate: new Date('2026-11-25T05:00:00Z'),
      payable: null,
      openCycle: null,
    },
    ...overrides,
  };
}

describe('buildPortalNotifications (Portal del vecino)', () => {
  const now = new Date('2026-11-24T12:00:00Z');

  it('genera aviso de pago vencido, por vencer, bloqueado, rebote y cargos pendientes', () => {
    const overdueStore = makeAccount({
      storeId: 'store-1',
      storeName: 'Bodega Sol',
      account: {
        ...makeAccount().account!,
        status: 'BLOCKED',
        payable: {
          cycleId: 'cyc-1',
          totalDue: '42.50',
          paymentDueDate: new Date('2026-11-20T05:00:00Z'),
          status: 'OVERDUE',
        },
      },
      emailBouncedAt: new Date('2026-11-23T05:00:00Z'),
    });

    const dueSoonStore = makeAccount({
      storeId: 'store-2',
      storeName: 'Bodega Luna',
      account: {
        ...makeAccount().account!,
        payable: {
          cycleId: 'cyc-2',
          totalDue: '18.00',
          paymentDueDate: new Date('2026-11-26T05:00:00Z'),
          status: 'BILLED',
        },
      },
    });

    const alerts: PortalChargeAlert[] = [
      {
        storeId: 'store-2',
        storeName: 'Bodega Luna',
        chargeId: 'chg-1',
        cycleId: 'cyc-2',
        amount: '12.00',
        currency: 'PEN',
        consentStatus: 'PENDING',
        consentDeadline: new Date('2026-11-25T12:00:00Z'),
      },
      {
        storeId: 'store-1',
        storeName: 'Bodega Sol',
        chargeId: 'chg-2',
        cycleId: 'cyc-1',
        amount: '8.50',
        currency: 'PEN',
        consentStatus: 'OBJECTED',
        consentDeadline: null,
      },
    ];

    const items = buildPortalNotifications([overdueStore, dueSoonStore], alerts, now, m);
    expect(items.map((i) => [i.kind, i.tone, i.href])).toEqual([
      ['overdue', 'error', '/portal/store-1/cycles/cyc-1'],
      ['accountAlert', 'warning', '/portal/store-1'],
      ['accountAlert', 'warning', '/portal/store-1/store'],
      ['dueSoon', 'warning', '/portal/store-2/cycles/cyc-2'],
      ['pendingCharge', 'info', '/portal/store-2/cycles/cyc-2'],
      ['objectedCharge', 'warning', '/portal/store-1/cycles/cyc-1'],
    ]);
    expect(items[0]?.body).toContain('S/ 42.50');
  });

  it('devuelve lista vacía cuando todo está al día', () => {
    const clean = makeAccount();
    expect(buildPortalNotifications([clean], [], now, m)).toEqual([]);
  });
});
