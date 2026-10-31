import type { ConsentRecord } from '../credit/customer-consent';
import type { DocumentId } from '../identity/document-id';
import type { Locale } from '../shared/locale';

/** Datos generales del vecino (US04), ya validados. */
export type CustomerProfile = {
  document: DocumentId;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string | null;
  preferredLocale: Locale | null;
};

export type RegisterCustomerData = {
  storeId: string;
  actorId: string;
  profile: CustomerProfile;
  consent: ConsentRecord;
  now: Date;
};

export type UpdateCustomerData = {
  storeId: string;
  actorId: string;
  customerId: string;
  profile: CustomerProfile;
  now: Date;
};

export type SetCustomerActiveData = {
  storeId: string;
  actorId: string;
  customerId: string;
  active: boolean;
  now: Date;
};

export interface CustomerRepository {
  /** Inserta vecino, consentimiento y auditoría en una sola transacción. */
  register(data: RegisterCustomerData): Promise<{ customerId: string } | 'DOCUMENT_TAKEN'>;
  update(data: UpdateCustomerData): Promise<'OK' | 'NOT_FOUND' | 'DOCUMENT_TAKEN'>;
  /** Dar de baja exige saldo cero y suspende su cuenta de crédito (D5). */
  setActive(data: SetCustomerActiveData): Promise<'OK' | 'NOT_FOUND' | 'HAS_BALANCE'>;
}
