import { DocumentId, type DocumentType } from '@/core/domain/identity/document-id';
import { MobilePhone } from '@/core/domain/identity/mobile-phone';
import { PersonName } from '@/core/domain/identity/person-name';
import type { CustomerProfile } from '@/core/domain/ports/customer-repository';
import type { Locale } from '@/core/domain/shared/locale';
import { err, ok, type Result } from '@/core/domain/shared/result';

/** Lo que llega del formulario: textos sin normalizar. */
export type CustomerProfileInput = {
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  preferredLocale: Locale | null;
};

export type CustomerProfileError =
  | 'DOCUMENT_INVALID'
  | 'FIRST_NAME_INVALID'
  | 'LAST_NAME_INVALID'
  | 'PHONE_INVALID'
  | 'EMAIL_INVALID';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** US04 crit. 1: documento válido, nombres, apellidos, celular y correo. */
export function parseCustomerProfile(
  input: CustomerProfileInput,
): Result<CustomerProfile, CustomerProfileError> {
  const document = DocumentId.parse(input.documentType, input.documentNumber);
  if (!document.ok) return err('DOCUMENT_INVALID');
  const firstName = PersonName.parse(input.firstName);
  if (!firstName.ok) return err('FIRST_NAME_INVALID');
  const lastName = PersonName.parse(input.lastName);
  if (!lastName.ok) return err('LAST_NAME_INVALID');
  const phone = MobilePhone.parse(input.phone);
  if (!phone.ok) return err('PHONE_INVALID');
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 150) return err('EMAIL_INVALID');
  const address = input.address.trim().replace(/\s+/g, ' ');

  return ok({
    document: document.value,
    firstName: firstName.value,
    lastName: lastName.value,
    phone: phone.value,
    email,
    address: address || null,
    preferredLocale: input.preferredLocale,
  });
}
