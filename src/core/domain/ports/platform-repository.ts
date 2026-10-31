import type { RateCap } from '../credit/rate-cap';
import type { TaxId } from '../identity/tax-id';
import type { Locale } from '../shared/locale';

/** US01.3, D1: la tienda que crea el Administrador nace en Casero, activa y sin prueba. */
export type CreateStoreData = {
  adminId: string;
  commercialName: string;
  businessTurn: string;
  taxId: TaxId;
  ownerName: string;
  ownerEmail: string;
  locale: Locale;
  now: Date;
};

export type StoreStatusData = { adminId: string; storeId: string; active: boolean; now: Date };

export interface PlatformStoreRepository {
  /** Tienda, suscripción, unidades, dueño invitado y auditoría en una transacción. */
  create(
    data: CreateStoreData,
  ): Promise<{ storeId: string; ownerId: string } | 'TAX_ID_TAKEN' | 'EMAIL_TAKEN'>;
  /** D3: suspender cierra las sesiones de todos sus usuarios. */
  setActive(data: StoreStatusData): Promise<'OK' | 'NOT_FOUND'>;
  /** Dueño que aún no define su contraseña, para reenviarle el enlace. */
  findPendingOwner(storeId: string): Promise<{
    userId: string;
    name: string;
    email: string;
    storeName: string;
    locale: Locale;
  } | null>;
}

export type AddRateCapData = {
  adminId: string;
  cap: Omit<RateCap, 'validTo'>;
  source: string;
  now: Date;
};

export interface RateCapRepository {
  /** Abre una vigencia nueva y cierra la anterior el día previo. */
  add(data: AddRateCapData): Promise<'OK' | 'NOT_AFTER_CURRENT'>;
}
