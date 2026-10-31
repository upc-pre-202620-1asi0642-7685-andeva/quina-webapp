import { z } from 'zod';
import type { SaveCreditTermsError } from '@/core/application/credit/save-credit-terms';
import type { RegisterCustomerError } from '@/core/application/customers/register-customer';
import { DOCUMENT_TYPES } from '@/core/domain/identity/document-id';
import { locales } from '@/core/domain/shared/locale';

/** Forma del formulario del vecino; las reglas de negocio las aplica el caso de uso. */
export const customerFormSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z.string().max(40),
  firstName: z.string().max(120),
  lastName: z.string().max(120),
  phone: z.string().max(30),
  email: z.string().max(160),
  address: z.string().max(300),
  preferredLocale: z.enum(['', ...locales]).transform((value) => (value === '' ? null : value)),
});

export type CustomerField =
  'documentNumber' | 'firstName' | 'lastName' | 'phone' | 'email' | 'consent' | 'form';

/** Error del caso de uso → campo y clave de `Customers.form.errors`. */
export function customerError(code: RegisterCustomerError | 'NOT_FOUND'): [CustomerField, string] {
  switch (code) {
    case 'DOCUMENT_INVALID':
      return ['documentNumber', 'documentInvalid'];
    case 'DOCUMENT_TAKEN':
      return ['documentNumber', 'documentTaken'];
    case 'FIRST_NAME_INVALID':
      return ['firstName', 'firstNameInvalid'];
    case 'LAST_NAME_INVALID':
      return ['lastName', 'lastNameInvalid'];
    case 'PHONE_INVALID':
      return ['phone', 'phoneInvalid'];
    case 'EMAIL_INVALID':
      return ['email', 'emailInvalid'];
    case 'CONSENT_REQUIRED':
      return ['consent', 'consentRequired'];
    case 'NOT_FOUND':
      return ['form', 'notFound'];
  }
}

const RATE_TYPES = ['EFFECTIVE', 'NOMINAL'] as const;
const PERIODS = ['ANNUAL', 'MONTHLY', 'DAILY'] as const;

const capitalization = z.enum(['', ...PERIODS]).transform((value) => (value === '' ? null : value));

export const termsFormSchema = z.object({
  currency: z.enum(['PEN', 'USD']),
  creditLimit: z.string().max(30),
  compensatoryType: z.enum(RATE_TYPES),
  compensatoryPercent: z.string().max(20),
  compensatoryPeriod: z.enum(PERIODS),
  compensatoryCapitalization: capitalization,
  moratoryType: z.enum(RATE_TYPES),
  moratoryPercent: z.string().max(20),
  moratoryPeriod: z.enum(PERIODS),
  moratoryCapitalization: capitalization,
  cutOffDay: z.coerce.number().int(),
  paymentDueDay: z.coerce.number().int(),
  maxInstallmentMonths: z.coerce.number().int(),
});

export type TermsForm = z.infer<typeof termsFormSchema>;

export type TermsField =
  | 'currency'
  | 'creditLimit'
  | 'compensatoryPercent'
  | 'compensatoryCapitalization'
  | 'moratoryPercent'
  | 'moratoryCapitalization'
  | 'cutOffDay'
  | 'paymentDueDay'
  | 'maxInstallmentMonths'
  | 'form';

/** Error del caso de uso → campo y clave de `Customers.terms.errors`. */
export function termsError(code: SaveCreditTermsError): [TermsField, string] {
  if (code === 'CREDIT_LIMIT_INVALID' || code === 'CREDIT_LIMIT_NOT_POSITIVE') {
    return ['creditLimit', 'limitInvalid'];
  }
  if (code === 'CUT_OFF_DAY_OUT_OF_RANGE') return ['cutOffDay', 'dayOutOfRange'];
  if (code === 'PAYMENT_DUE_DAY_OUT_OF_RANGE') return ['paymentDueDay', 'dayOutOfRange'];
  if (code === 'MAX_INSTALLMENT_MONTHS_OUT_OF_RANGE') {
    return ['maxInstallmentMonths', 'monthsOutOfRange'];
  }
  if (code === 'CURRENCY_LOCKED') return ['currency', 'currencyLocked'];
  if (code === 'CUSTOMER_INACTIVE') return ['form', 'customerInactive'];
  if (code === 'PLAN_LIMIT_REACHED') return ['form', 'planLimit'];
  if (code === 'NOT_FOUND') return ['form', 'generic'];

  const kind = code.startsWith('COMPENSATORY_') ? 'compensatory' : 'moratory';
  if (code.endsWith('_NO_CAP_IN_FORCE')) return ['form', 'noCap'];
  if (code.endsWith('_RATE_ABOVE_CAP')) return [`${kind}Percent`, 'aboveCap'];
  if (code.endsWith('_NOMINAL_NEEDS_CAPITALIZATION')) {
    return [`${kind}Capitalization`, 'needsCapitalization'];
  }
  if (code.endsWith('_CAPITALIZATION_LONGER_THAN_PERIOD')) {
    return [`${kind}Capitalization`, 'capitalizationLonger'];
  }
  return [`${kind}Percent`, 'percentInvalid'];
}
