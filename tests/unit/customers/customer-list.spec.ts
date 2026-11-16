import { describe, expect, it } from 'vitest';
import type { CustomerListItem } from '@/infrastructure/db/queries/customers';
import {
  availableCreditAmount,
  customerInitials,
  customerListHref,
  filterAndSortCustomers,
  parseCustomerListQuery,
  summarizeCustomerList,
  whatsappHref,
} from '@/presentation/lib/customer-list';

function item(overrides: Partial<CustomerListItem> = {}): CustomerListItem {
  return {
    id: 'c-1',
    firstName: 'Rosa',
    lastName: 'Quispe',
    documentType: 'DNI',
    documentNumber: '45678901',
    phone: '987654321',
    isActive: true,
    account: {
      id: 'a-1',
      currency: 'PEN',
      creditLimit: '200.00',
      currentBalance: '50.00',
      status: 'ACTIVE',
      cutOffDay: 20,
      paymentDueDay: 26,
    },
    collections: {
      payableAmount: '0.00',
      overdueAmount: '0.00',
      payableCyclesCount: 0,
      hasOverdue: false,
      hasDueSoon: false,
      nextDueDate: null,
    },
    ...overrides,
  };
}

describe('customer-list helpers', () => {
  it('parses and normalizes query params safely', () => {
    expect(parseCustomerListQuery({ q: 'rosa', filter: 'invalid', sort: 'nope' })).toEqual({
      q: 'rosa',
      filter: 'all',
      sort: 'name',
    });
    expect(parseCustomerListQuery({ filter: 'overdue', sort: 'debt' })).toEqual({
      q: '',
      filter: 'overdue',
      sort: 'debt',
    });
    expect(customerListHref({ q: ' rosa ', filter: 'all', sort: 'name' })).toBe(
      '/customers?q=rosa',
    );
    expect(customerListHref({ filter: 'overdue', sort: 'debt' })).toBe(
      '/customers?filter=overdue&sort=debt',
    );
  });

  it('computes available credit, utilization percent, initials, and whatsapp href', () => {
    expect(
      availableCreditAmount({ currency: 'PEN', creditLimit: '200.00', currentBalance: '50.00' }),
    ).toEqual({
      amount: '150.00',
      currency: 'PEN',
      usedPercent: 25,
      overLimit: false,
    });
    expect(
      availableCreditAmount({ currency: 'PEN', creditLimit: '100.00', currentBalance: '120.00' }),
    ).toEqual({
      amount: '0.00',
      currency: 'PEN',
      usedPercent: 100,
      overLimit: true,
    });
    expect(customerInitials('Rosa', 'Quispe')).toBe('RQ');
    expect(whatsappHref('987 654 321')).toBe('https://wa.me/51987654321');
    expect(whatsappHref('+51 987654321')).toBe('https://wa.me/51987654321');
    expect(whatsappHref('12345')).toBeNull();
  });

  it('summarizes, filters, and sorts customers accurately', () => {
    const overdueCustomer = item({
      id: 'c-overdue',
      firstName: 'Ana',
      lastName: 'Lopez',
      account: {
        id: 'a-2',
        currency: 'PEN',
        creditLimit: '100.00',
        currentBalance: '90.00',
        status: 'ACTIVE',
        cutOffDay: 20,
        paymentDueDay: 26,
      },
      collections: {
        payableAmount: '90.00',
        overdueAmount: '90.00',
        payableCyclesCount: 1,
        hasOverdue: true,
        hasDueSoon: false,
        nextDueDate: new Date('2026-11-01T00:00:00Z'),
      },
    });
    const cashOnly = item({
      id: 'c-cash',
      firstName: 'Bruno',
      lastName: 'Diaz',
      account: null,
    });
    const inactive = item({
      id: 'c-inactive',
      firstName: 'Carlos',
      lastName: 'Mendoza',
      isActive: false,
      account: null,
    });

    const all = [item(), overdueCustomer, cashOnly, inactive];
    const summary = summarizeCustomerList(all);
    expect(summary).toEqual({
      totalActive: 3,
      withCredit: 2,
      collectableCount: 1,
      overdueCount: 1,
      counts: {
        all: 4,
        collectable: 1,
        overdue: 1,
        active: 2,
        suspended: 0,
        cashOnly: 1,
        inactive: 1,
      },
    });

    expect(
      filterAndSortCustomers(all, { filter: 'overdue', sort: 'name' }).map((c) => c.id),
    ).toEqual(['c-overdue']);
    expect(
      filterAndSortCustomers(all, { filter: 'cashOnly', sort: 'name' }).map((c) => c.id),
    ).toEqual(['c-cash']);
    expect(
      filterAndSortCustomers(all, { filter: 'inactive', sort: 'name' }).map((c) => c.id),
    ).toEqual(['c-inactive']);
    expect(filterAndSortCustomers(all, { filter: 'all', sort: 'debt' }).map((c) => c.id)).toEqual([
      'c-overdue',
      'c-1',
      'c-cash',
      'c-inactive',
    ]);
  });
});
