import { describe, expect, it } from 'vitest';
import type {
  CollectionRow,
  ObjectedChargeRow,
  RecentPaymentRow,
  TodayNotice,
} from '@/infrastructure/db/queries/collections';
import {
  collectionDaysDelta,
  collectionsHref,
  filterAndSortCollections,
  filterObjectedCharges,
  filterRecentPayments,
  filterTodayNotices,
  parseCollectionsQuery,
  summarizeCollections,
  whatsappWithMessageHref,
} from '@/presentation/lib/collections-list';

const NOW = new Date('2026-11-16T15:00:00Z'); // 10:00 Lima (2026-11-16)

function row(partial: Partial<CollectionRow>): CollectionRow {
  return {
    cycleId: 'c1',
    cycleNumber: 1,
    customerId: 'cust1',
    name: 'Rosa Quispe',
    phone: '987654321',
    emailBouncedAt: null,
    accountStatus: 'ACTIVE',
    status: 'BILLED',
    currency: 'PEN',
    totalDue: '50.00',
    amountPaid: '0.00',
    cutOffDate: new Date('2026-11-01T05:00:00Z'),
    paymentDueDate: new Date('2026-11-18T05:00:00Z'),
    objectedCount: 0,
    ...partial,
  };
}

describe('collections-list helpers', () => {
  it('parsea y normaliza los parámetros de consulta con valores seguros', () => {
    expect(parseCollectionsQuery({})).toEqual({
      tab: 'due',
      q: '',
      filter: 'all',
      sort: 'dueDate',
      method: 'all',
    });
    expect(
      parseCollectionsQuery({
        tab: 'payments',
        q: 'Rosa',
        filter: 'dueSoon',
        sort: 'amountDesc',
        method: 'YAPE',
      }),
    ).toEqual({
      tab: 'payments',
      q: 'Rosa',
      filter: 'dueSoon',
      sort: 'amountDesc',
      method: 'YAPE',
    });
    expect(parseCollectionsQuery({ tab: 'invalid', filter: 'x', sort: 'y', method: 'z' })).toEqual({
      tab: 'due',
      q: '',
      filter: 'all',
      sort: 'dueDate',
      method: 'all',
    });
  });

  it('construye URLs limpias omitiendo valores por defecto', () => {
    expect(collectionsHref({ tab: 'due', filter: 'all', sort: 'dueDate' })).toBe('/collections');
    expect(
      collectionsHref({ tab: 'due', q: '  rosa ', filter: 'blocked' }, { sort: 'amountDesc' }),
    ).toBe('/collections?q=rosa&filter=blocked&sort=amountDesc');
  });

  it('filtra por vence pronto (<= 3 días), observación y rebote, y ordena correctamente', () => {
    const rows: CollectionRow[] = [
      row({
        cycleId: 'c1',
        name: 'Carlos Vega',
        totalDue: '25.00',
        paymentDueDate: new Date('2026-11-25T05:00:00Z'), // 9 días
      }),
      row({
        cycleId: 'c2',
        name: 'Ana Díaz',
        totalDue: '120.00',
        paymentDueDate: new Date('2026-11-18T05:00:00Z'), // 2 días
        objectedCount: 1,
      }),
      row({
        cycleId: 'c3',
        name: 'Beto Ramos',
        status: 'OVERDUE',
        totalDue: '80.00',
        paymentDueDate: new Date('2026-11-10T05:00:00Z'), // -6 días
        emailBouncedAt: new Date('2026-11-12T05:00:00Z'),
      }),
    ];

    expect(collectionDaysDelta(rows[1]!.paymentDueDate, NOW)).toBe(2);
    expect(
      filterAndSortCollections(rows, { q: '', filter: 'dueSoon', sort: 'dueDate' }, NOW).map(
        (r) => r.cycleId,
      ),
    ).toEqual(['c2']);
    expect(
      filterAndSortCollections(rows, { q: '', filter: 'blocked', sort: 'dueDate' }, NOW).map(
        (r) => r.cycleId,
      ),
    ).toEqual(['c2']);
    expect(
      filterAndSortCollections(rows, { q: '', filter: 'bounced', sort: 'dueDate' }, NOW).map(
        (r) => r.cycleId,
      ),
    ).toEqual(['c3']);
    expect(
      filterAndSortCollections(rows, { q: '', filter: 'all', sort: 'amountDesc' }, NOW).map(
        (r) => r.cycleId,
      ),
    ).toEqual(['c2', 'c3', 'c1']);
    expect(
      filterAndSortCollections(rows, { q: 'vega', filter: 'all', sort: 'name' }, NOW).map(
        (r) => r.cycleId,
      ),
    ).toEqual(['c1']);
  });

  it('resume totales multimoneda y cobrado hoy en Lima', () => {
    const rows: CollectionRow[] = [
      row({ cycleId: 'c1', status: 'BILLED', currency: 'PEN', totalDue: '40.50' }),
      row({
        cycleId: 'c2',
        status: 'OVERDUE',
        currency: 'PEN',
        totalDue: '60.00',
        paymentDueDate: new Date('2026-11-10T05:00:00Z'),
        objectedCount: 2,
      }),
      row({
        cycleId: 'c3',
        status: 'BILLED',
        currency: 'USD',
        totalDue: '15.00',
        emailBouncedAt: new Date('2026-11-15T05:00:00Z'),
      }),
    ];
    const payments: RecentPaymentRow[] = [
      {
        id: 'p1',
        receiptNumber: 'R-000001',
        paymentDate: new Date('2026-11-16T14:00:00Z'), // hoy en Lima
        paymentMethod: 'YAPE',
        amountPaid: '30.00',
        daysLate: 0,
        currency: 'PEN',
        customerId: 'cust1',
        customerName: 'Rosa Quispe',
        collectorName: 'Don Lucho',
        cycleId: 'c0',
        cutOffDate: new Date('2026-10-01T05:00:00Z'),
      },
      {
        id: 'p2',
        receiptNumber: 'R-000002',
        paymentDate: new Date('2026-11-15T14:00:00Z'), // ayer
        paymentMethod: 'CASH',
        amountPaid: '50.00',
        daysLate: 0,
        currency: 'PEN',
        customerId: 'cust2',
        customerName: 'Pedro',
        collectorName: 'Don Lucho',
        cycleId: 'c0',
        cutOffDate: new Date('2026-10-01T05:00:00Z'),
      },
    ];

    const summary = summarizeCollections(rows, payments, NOW);
    expect(summary).toEqual({
      dueCount: 2,
      overdueCount: 1,
      dueSoonCount: 2,
      blockedCount: 1,
      bouncedCount: 1,
      totalCollectable: { pen: '100.50', usd: '15.00' },
      totalOverdue: { pen: '60.00', usd: '0.00' },
      collectedToday: { pen: '30.00', usd: '0.00' },
      collectedTodayCount: 1,
    });
  });

  it('filtra observaciones, recibos recientes, avisos y arma enlaces WhatsApp', () => {
    const objections: ObjectedChargeRow[] = [
      {
        chargeId: 'ch1',
        customerId: 'cust1',
        customerName: 'Rosa Quispe',
        customerPhone: '987654321',
        cycleId: 'c1',
        cycleNumber: 1,
        cutOffDate: NOW,
        purchaseDate: NOW,
        currency: 'PEN',
        principalAmount: '12.00',
        items: [{ name: 'Arroz Costeño', quantity: '2', amount: '12.00' }],
        objectionNote: 'No llevó arroz',
        objectedAt: NOW,
      },
    ];
    expect(filterObjectedCharges(objections, 'arroz')).toHaveLength(1);
    expect(filterObjectedCharges(objections, 'leche')).toHaveLength(0);

    const payments: RecentPaymentRow[] = [
      {
        id: 'p1',
        receiptNumber: 'R-000001',
        paymentDate: NOW,
        paymentMethod: 'YAPE',
        amountPaid: '20.00',
        daysLate: 0,
        currency: 'PEN',
        customerId: 'cust1',
        customerName: 'Rosa Quispe',
        collectorName: 'Ana',
        cycleId: 'c1',
        cutOffDate: NOW,
      },
    ];
    expect(filterRecentPayments(payments, { q: 'R-000001', method: 'YAPE' })).toHaveLength(1);
    expect(filterRecentPayments(payments, { q: '', method: 'CASH' })).toHaveLength(0);

    const notices: TodayNotice[] = [
      {
        id: 'n1',
        type: 'PAYMENT_REMINDER',
        status: 'DELIVERED',
        customerId: 'cust1',
        name: 'Rosa Quispe',
        recipientEmail: 'rosa@example.com',
        at: NOW,
      },
    ];
    expect(filterTodayNotices(notices, 'rosa@')).toHaveLength(1);

    expect(whatsappWithMessageHref('987 654 321', 'Hola Rosa')).toBe(
      'https://wa.me/51987654321?text=Hola%20Rosa',
    );
    expect(whatsappWithMessageHref('123', 'Hola')).toBeNull();
  });
});
