import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { CreditAccountTerms } from '@/core/domain/ports/credit-account-repository';
import { termsFromRow } from '../repositories/drizzle-credit-account-repository';
import { creditAccounts, customers } from '../schema';
import { withTenant } from '../with-tenant';

export type CustomerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  phone: string | null;
  isActive: boolean;
  account: {
    currency: string;
    creditLimit: string;
    currentBalance: string;
    status: string;
  } | null;
};

export type CustomerDetail = CustomerListItem & {
  /** Cuenta de fiado, para sus ciclos (Plan 4). */
  accountId: string | null;
  /** Último rebote del correo (US11 crit. 5). */
  emailBouncedAt: Date | null;
  email: string;
  address: string | null;
  preferredLocale: string | null;
  createdAt: Date;
  terms: CreditAccountTerms | null;
};

const LIST_LIMIT = 200;

/** Lista de vecinos de la tienda con búsqueda por nombre o documento. */
export async function listCustomers(storeId: string, search = ''): Promise<CustomerListItem[]> {
  const term = search.trim().replace(/[%_\\]/g, '');
  return withTenant(storeId, async (tx) => {
    const rows = await tx
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        documentType: customers.documentType,
        documentNumber: customers.documentNumber,
        phone: customers.phone,
        isActive: customers.isActive,
        currency: creditAccounts.currency,
        creditLimit: creditAccounts.creditLimit,
        currentBalance: creditAccounts.currentBalance,
        status: creditAccounts.status,
      })
      .from(customers)
      .leftJoin(creditAccounts, eq(creditAccounts.customerId, customers.id))
      .where(
        and(
          eq(customers.storeId, storeId),
          term
            ? or(
                ilike(customers.documentNumber, `%${term}%`),
                ilike(sql`${customers.firstName} || ' ' || ${customers.lastName}`, `%${term}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(customers.isActive), asc(customers.firstName), asc(customers.lastName))
      .limit(LIST_LIMIT);

    return rows.map(({ currency, creditLimit, currentBalance, status, ...customer }) => ({
      ...customer,
      account:
        currency && creditLimit && currentBalance && status
          ? { currency, creditLimit, currentBalance, status }
          : null,
    }));
  });
}

export async function getCustomer(
  storeId: string,
  customerId: string,
): Promise<CustomerDetail | null> {
  return withTenant(storeId, async (tx) => {
    const [row] = await tx
      .select({ customer: customers, account: creditAccounts })
      .from(customers)
      .leftJoin(creditAccounts, eq(creditAccounts.customerId, customers.id))
      .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)));
    if (!row) return null;
    const { customer, account } = row;
    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      phone: customer.phone,
      accountId: account?.id ?? null,
      emailBouncedAt: customer.emailBouncedAt,
      email: customer.email,
      address: customer.address,
      preferredLocale: customer.preferredLocale,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      account: account
        ? {
            currency: account.currency,
            creditLimit: account.creditLimit,
            currentBalance: account.currentBalance,
            status: account.status,
          }
        : null,
      terms: account ? termsFromRow(account) : null,
    };
  });
}
