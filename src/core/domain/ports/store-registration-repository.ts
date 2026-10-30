export type CreateStoreForOwnerData = {
  userId: string;
  storeId: string;
  commercialName: string;
  businessTurn: string;
  taxIdType: 'RUC' | 'DNI';
  taxIdNumber: string;
  ownerFullName: string;
  contactEmail: string;
  ip?: string;
  userAgent?: string;
  now: Date;
  trialEndsAt: Date;
};

export type CreateStoreForOwnerResult =
  { storeId: string; created: boolean } | 'TAX_ID_TAKEN' | 'EMAIL_TAKEN' | 'USER_NOT_PENDING';

export interface StoreRegistrationRepository {
  /**
   * Crea la tienda, su prueba Pro, las unidades base y la auditoría, y promueve al
   * usuario a STORE_OWNER, todo en una transacción. Si el usuario ya es dueño,
   * devuelve su tienda con `created: false`.
   */
  createStoreForOwner(data: CreateStoreForOwnerData): Promise<CreateStoreForOwnerResult>;
}
