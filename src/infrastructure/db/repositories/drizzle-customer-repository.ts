import { and, eq, sql } from 'drizzle-orm';
import type {
  CustomerProfile,
  CustomerRepository,
  RegisterCustomerData,
  SetCustomerActiveData,
  UpdateCustomerData,
} from '@/core/domain/ports/customer-repository';
import { Money, type Currency } from '@/core/domain/shared/money';
import { uniqueViolation } from '../errors';
import { auditLogs, creditAccounts, customerConsents, customers } from '../schema';
import { withTenant } from '../with-tenant';

const DOCUMENT_CONSTRAINT = 'uq_customers_store_document';

function columns(profile: CustomerProfile) {
  return {
    documentType: profile.document.type,
    documentNumber: profile.document.number,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
    preferredLocale: profile.preferredLocale,
  };
}

export class DrizzleCustomerRepository implements CustomerRepository {
  async register(data: RegisterCustomerData): Promise<{ customerId: string } | 'DOCUMENT_TAKEN'> {
    try {
      return await withTenant(data.storeId, async (tx) => {
        const [created] = await tx
          .insert(customers)
          .values({ storeId: data.storeId, ...columns(data.profile) })
          .returning({ id: customers.id });
        const customerId = created!.id;
        // Tablas de solo inserción: sin .returning()
        await tx.insert(customerConsents).values({
          storeId: data.storeId,
          customerId,
          consentType: data.consent.type,
          policyVersion: data.consent.version,
          ipAddress: data.consent.ip.slice(0, 45),
          userAgent: data.consent.userAgent,
          acceptedAt: data.now,
          evidenceText: data.consent.text,
        });
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'CREATE_CUSTOMER',
          entityName: 'customers',
          entityId: customerId,
          newData: { ...columns(data.profile), consentVersion: data.consent.version },
          ipAddress: data.consent.ip.slice(0, 45),
          userAgent: data.consent.userAgent,
        });
        return { customerId };
      });
    } catch (error) {
      if (uniqueViolation(error) === DOCUMENT_CONSTRAINT) return 'DOCUMENT_TAKEN';
      throw error;
    }
  }

  async update(data: UpdateCustomerData): Promise<'OK' | 'NOT_FOUND' | 'DOCUMENT_TAKEN'> {
    try {
      return await withTenant(data.storeId, async (tx) => {
        const [before] = await tx
          .select()
          .from(customers)
          .where(and(eq(customers.id, data.customerId), eq(customers.storeId, data.storeId)))
          .for('update');
        if (!before) return 'NOT_FOUND' as const;
        const next = columns(data.profile);
        await tx
          .update(customers)
          .set({ ...next, updatedAt: data.now })
          .where(eq(customers.id, data.customerId));
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.actorId,
          action: 'UPDATE_CUSTOMER',
          entityName: 'customers',
          entityId: data.customerId,
          oldData: {
            documentType: before.documentType,
            documentNumber: before.documentNumber,
            firstName: before.firstName,
            lastName: before.lastName,
            phone: before.phone,
            email: before.email,
            address: before.address,
            preferredLocale: before.preferredLocale,
          },
          newData: next,
        });
        return 'OK' as const;
      });
    } catch (error) {
      if (uniqueViolation(error) === DOCUMENT_CONSTRAINT) return 'DOCUMENT_TAKEN';
      throw error;
    }
  }

  async setActive(data: SetCustomerActiveData): Promise<'OK' | 'NOT_FOUND' | 'HAS_BALANCE'> {
    return withTenant(data.storeId, async (tx) => {
      const [customer] = await tx
        .select({ isActive: customers.isActive })
        .from(customers)
        .where(and(eq(customers.id, data.customerId), eq(customers.storeId, data.storeId)))
        .for('update');
      if (!customer) return 'NOT_FOUND' as const;
      if (customer.isActive === data.active) return 'OK' as const;

      if (!data.active) {
        const [account] = await tx
          .select({ balance: creditAccounts.currentBalance, currency: creditAccounts.currency })
          .from(creditAccounts)
          .where(eq(creditAccounts.customerId, data.customerId))
          .for('update');
        if (account && !Money.of(account.balance, account.currency as Currency).isZero()) {
          return 'HAS_BALANCE' as const;
        }
        if (account) {
          // D5: la baja libera el cupo del plan
          await tx
            .update(creditAccounts)
            .set({ status: 'SUSPENDED', updatedAt: data.now })
            .where(eq(creditAccounts.customerId, data.customerId));
        }
      }
      await tx
        .update(customers)
        .set({ isActive: data.active, updatedAt: sql`now()` })
        .where(eq(customers.id, data.customerId));
      await tx.insert(auditLogs).values({
        storeId: data.storeId,
        userId: data.actorId,
        action: data.active ? 'REACTIVATE_CUSTOMER' : 'DEACTIVATE_CUSTOMER',
        entityName: 'customers',
        entityId: data.customerId,
        oldData: { isActive: customer.isActive },
        newData: { isActive: data.active },
      });
      return 'OK' as const;
    });
  }
}
