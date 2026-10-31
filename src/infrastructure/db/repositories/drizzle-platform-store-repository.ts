import { and, eq, inArray } from 'drizzle-orm';
import type { Locale } from '@/core/domain/shared/locale';
import type {
  CreateStoreData,
  PlatformStoreRepository,
  StoreStatusData,
} from '@/core/domain/ports/platform-repository';
import type { Database } from '../connection';
import { db } from '../connection';
import { uniqueViolation } from '../errors';
import { auditLogs, sessions, storeSubscriptions, stores, units, users } from '../schema';
import { withTenant } from '../with-tenant';
import { BASE_UNITS } from './drizzle-store-registration-repository';
import { WITHOUT_PASSWORD } from './drizzle-team-repository';

/**
 * D2: el alta y la suspensión usan quina_app. stores, users y sessions no tienen
 * RLS; la suscripción, las unidades y la auditoría van con el contexto de la tienda.
 */
export class DrizzlePlatformStoreRepository implements PlatformStoreRepository {
  constructor(private readonly database: Database = db) {}

  async create(
    data: CreateStoreData,
  ): Promise<{ storeId: string; ownerId: string } | 'TAX_ID_TAKEN' | 'EMAIL_TAKEN'> {
    const storeId = crypto.randomUUID();
    try {
      return await withTenant(
        storeId,
        async (tx) => {
          await tx.insert(stores).values({
            id: storeId,
            commercialName: data.commercialName,
            businessTurn: data.businessTurn,
            taxIdType: data.taxId.type,
            taxIdNumber: data.taxId.number,
            ownerFullName: data.ownerName,
            contactEmail: data.ownerEmail,
            defaultLocale: data.locale,
          });
          await tx.insert(storeSubscriptions).values({
            storeId,
            planTier: 'CASERO',
            status: 'ACTIVE',
            currentPeriodStart: data.now,
          });
          await tx.insert(units).values(BASE_UNITS.map((unit) => ({ ...unit, storeId })));
          // Dueño invitado (D4): define su contraseña con el enlace de 72 horas
          const [owner] = await tx
            .insert(users)
            .values({
              name: data.ownerName,
              email: data.ownerEmail,
              emailVerified: false,
              role: 'STORE_OWNER',
              storeId,
              preferredLocale: data.locale,
            })
            .returning({ id: users.id });
          await tx.insert(auditLogs).values({
            storeId,
            userId: data.adminId,
            action: 'CREATE_STORE',
            entityName: 'stores',
            entityId: storeId,
            newData: {
              commercialName: data.commercialName,
              taxIdType: data.taxId.type,
              ownerEmail: data.ownerEmail,
              planTier: 'CASERO',
              status: 'ACTIVE',
              by: 'PLATFORM_ADMIN',
            },
          });
          return { storeId, ownerId: owner!.id };
        },
        this.database,
      );
    } catch (error) {
      // US01.4: RUC o correo repetidos se rechazan con su motivo
      const constraint = uniqueViolation(error);
      if (constraint === 'stores_tax_id_number_unique') return 'TAX_ID_TAKEN';
      if (constraint === 'stores_contact_email_unique' || constraint === 'users_email_unique') {
        return 'EMAIL_TAKEN';
      }
      throw error;
    }
  }

  async setActive(data: StoreStatusData): Promise<'OK' | 'NOT_FOUND'> {
    return withTenant(
      data.storeId,
      async (tx) => {
        const [store] = await tx
          .select({ isActive: stores.isActive })
          .from(stores)
          .where(eq(stores.id, data.storeId))
          .for('update');
        if (!store) return 'NOT_FOUND';
        if (store.isActive === data.active) return 'OK';
        await tx
          .update(stores)
          .set({ isActive: data.active, updatedAt: data.now })
          .where(eq(stores.id, data.storeId));
        // D3: nadie de la tienda suspendida sigue dentro
        if (!data.active) {
          const members = tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.storeId, data.storeId));
          await tx.delete(sessions).where(inArray(sessions.userId, members));
        }
        await tx.insert(auditLogs).values({
          storeId: data.storeId,
          userId: data.adminId,
          action: data.active ? 'REACTIVATE_STORE' : 'SUSPEND_STORE',
          entityName: 'stores',
          entityId: data.storeId,
          oldData: { isActive: store.isActive },
          newData: { isActive: data.active },
        });
        return 'OK';
      },
      this.database,
    );
  }

  async findPendingOwner(storeId: string) {
    const [row] = await this.database
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        locale: users.preferredLocale,
        storeName: stores.commercialName,
      })
      .from(users)
      .innerJoin(stores, eq(stores.id, users.storeId))
      .where(
        and(
          eq(users.storeId, storeId),
          eq(users.role, 'STORE_OWNER'),
          eq(stores.isActive, true),
          WITHOUT_PASSWORD,
        ),
      );
    return row ? { ...row, locale: row.locale as Locale } : null;
  }
}
