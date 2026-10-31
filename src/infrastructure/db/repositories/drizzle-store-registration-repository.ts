import { eq, sql } from 'drizzle-orm';
import type {
  CreateStoreForOwnerData,
  CreateStoreForOwnerResult,
  StoreRegistrationRepository,
} from '@/core/domain/ports/store-registration-repository';
import { uniqueViolation } from '../errors';
import { auditLogs, storeSubscriptions, stores, units, users } from '../schema';
import { withTenant } from '../with-tenant';

const BASE_UNITS = [
  { code: 'UND', name: 'Unidad', allowDecimals: false },
  { code: 'KG', name: 'Kilogramo', allowDecimals: true },
  { code: 'LTR', name: 'Litro', allowDecimals: true },
];

export class DrizzleStoreRegistrationRepository implements StoreRegistrationRepository {
  async createStoreForOwner(data: CreateStoreForOwnerData): Promise<CreateStoreForOwnerResult> {
    const { storeId } = data;
    try {
      return await withTenant(storeId, async (tx) => {
        // Bloquea al usuario: un segundo envío espera y luego ve su tienda ya creada
        const [user] = await tx
          .select({ role: users.role, storeId: users.storeId })
          .from(users)
          .where(eq(users.id, data.userId))
          .for('update');
        if (user?.role === 'STORE_OWNER' && user.storeId) {
          return { storeId: user.storeId, created: false };
        }
        if (user?.role !== 'PENDING_OWNER') return 'USER_NOT_PENDING' as const;

        await tx.insert(stores).values({
          id: storeId,
          commercialName: data.commercialName,
          businessTurn: data.businessTurn,
          taxIdType: data.taxIdType,
          taxIdNumber: data.taxIdNumber,
          ownerFullName: data.ownerFullName,
          contactEmail: data.contactEmail,
        });
        await tx.insert(storeSubscriptions).values({
          storeId,
          planTier: 'BODEGA_PRO',
          status: 'TRIALING',
          trialEndsAt: data.trialEndsAt,
          currentPeriodStart: data.now,
        });
        await tx.insert(units).values(BASE_UNITS.map((unit) => ({ ...unit, storeId })));
        await tx.insert(auditLogs).values({
          storeId,
          userId: data.userId,
          action: 'CREATE_STORE',
          entityName: 'stores',
          entityId: storeId,
          newData: {
            commercialName: data.commercialName,
            taxIdType: data.taxIdType,
            planTier: 'BODEGA_PRO',
            status: 'TRIALING',
            trialEndsAt: data.trialEndsAt.toISOString(),
          },
          ipAddress: data.ip,
          userAgent: data.userAgent,
        });
        await tx
          .update(users)
          .set({ role: 'STORE_OWNER', storeId, updatedAt: sql`now()` })
          .where(eq(users.id, data.userId));
        return { storeId, created: true };
      });
    } catch (error) {
      const constraint = uniqueViolation(error);
      if (constraint === 'stores_tax_id_number_unique') return 'TAX_ID_TAKEN';
      if (constraint === 'stores_contact_email_unique') return 'EMAIL_TAKEN';
      throw error;
    }
  }
}
