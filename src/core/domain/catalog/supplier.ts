import { EmailAddress } from '@/core/domain/identity/email-address';
import { TaxId } from '@/core/domain/identity/tax-id';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type SupplierDetails = {
  taxIdNumber: string;
  tradeName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
};

export type SupplierInput = {
  taxIdNumber: string;
  tradeName: string;
  contactName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
};

export type SupplierError =
  'TAX_ID_INVALID' | 'TRADE_NAME_REQUIRED' | 'CONTACT_TOO_LONG' | 'PHONE_INVALID' | 'EMAIL_INVALID';

const clean = (raw: string | undefined) => (raw ?? '').trim().replace(/\s+/g, ' ');
const PHONE = /^[0-9+\-() ]{6,20}$/;

export function parseSupplier(input: SupplierInput): Result<SupplierDetails, SupplierError> {
  const taxId = TaxId.parse(input.taxIdNumber);
  if (!taxId.ok) return err('TAX_ID_INVALID');

  const tradeName = clean(input.tradeName);
  if (tradeName.length < 2 || tradeName.length > 150) return err('TRADE_NAME_REQUIRED');

  const contactName = clean(input.contactName) || null;
  if (contactName && contactName.length > 100) return err('CONTACT_TOO_LONG');

  const phone = clean(input.phone) || null;
  if (phone && !PHONE.test(phone)) return err('PHONE_INVALID');

  const rawEmail = clean(input.email);
  let email: string | null = null;
  if (rawEmail) {
    const parsedEmail = EmailAddress.parse(rawEmail);
    if (!parsedEmail.ok) return err('EMAIL_INVALID');
    email = parsedEmail.value;
  }

  return ok({
    taxIdNumber: taxId.value.number,
    tradeName,
    contactName,
    phone,
    email,
  });
}
