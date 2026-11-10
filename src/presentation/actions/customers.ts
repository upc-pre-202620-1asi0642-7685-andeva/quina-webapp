'use server';

import { revalidatePath } from 'next/cache';
import { actionRedirect } from '@/presentation/lib/action-redirect';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import {
  SaveCreditTermsUseCase,
  SetCreditAccountStatusUseCase,
} from '@/core/application/credit/save-credit-terms';
import { RegisterCustomerUseCase } from '@/core/application/customers/register-customer';
import {
  SetCustomerActiveUseCase,
  UpdateCustomerUseCase,
} from '@/core/application/customers/update-customer';
import type { RatePeriod, RateType } from '@/core/domain/finance/rate';
import { getNotificationMailer } from '@/infrastructure/email/auth-mailer-factory';
import { DrizzleCreditAccountRepository } from '@/infrastructure/db/repositories/drizzle-credit-account-repository';
import { DrizzleCustomerRepository } from '@/infrastructure/db/repositories/drizzle-customer-repository';
import { authorizeStore } from '@/presentation/auth/guards';
import { formatMoney } from '@/presentation/components/money';
import { appUrl, requestMeta } from '@/presentation/lib/request-meta';
import { loadStoreContext } from '@/presentation/queries/store-context';
import {
  customerError,
  customerFormSchema,
  termsError,
  termsFormSchema,
  type CustomerField,
  type TermsField,
  type TermsForm,
} from '@/presentation/validation/customer-form';

export type CustomerFormState = {
  errors?: Partial<Record<CustomerField, string>>;
};

export type TermsFormState = {
  errors?: Partial<Record<TermsField, string>>;
};

export type CustomerActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

function readCustomerForm(formData: FormData) {
  return customerFormSchema.safeParse({
    documentType: formData.get('documentType'),
    documentNumber: String(formData.get('documentNumber') ?? ''),
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
    preferredLocale: String(formData.get('preferredLocale') ?? ''),
  });
}

/** US04: el dueño o el empleado registran al vecino con su autorización. */
export async function registerCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await authorizeStore('customers.create');
  if (!user) return actionRedirect('/login');

  const parsed = readCustomerForm(formData);
  if (!parsed.success) return { errors: { form: 'generic' } };

  const store = await loadStoreContext(user.storeId);
  const t = await getTranslations('Customers.form');
  const meta = await requestMeta();
  const useCase = new RegisterCustomerUseCase(
    new DrizzleCustomerRepository(),
    getNotificationMailer(),
  );
  const result = await useCase.execute({
    storeId: user.storeId,
    storeName: store.name,
    storeLocale: store.defaultLocale,
    actorId: user.id,
    profile: parsed.data,
    consentAccepted: formData.get('consent') === 'on',
    // Evidencia: el texto exacto que se mostró, en el idioma de la pantalla
    consentText: t('consentText', { store: store.name }),
    ...meta,
    privacyUrl: appUrl(`/privacy/customers/${user.storeId}`),
    now: new Date(),
  });

  if (!result.ok) {
    const [field, key] = customerError(result.error);
    return { errors: { [field]: key } };
  }

  revalidatePath('/customers');
  const notice = result.value.welcomeSent ? 'created' : 'createdNoMail';
  // El dueño sigue al paso 2 (condiciones); el empleado no pacta condiciones
  const next =
    user.role === 'STORE_OWNER'
      ? `/customers/${result.value.customerId}/terms?new=1&notice=${notice}`
      : `/customers/${result.value.customerId}?notice=${notice}`;
  return actionRedirect(next);
}

export async function updateCustomerAction(
  customerId: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await authorizeStore('customers.update');
  if (!user) return actionRedirect('/login');
  if (!idSchema.safeParse(customerId).success) return { errors: { form: 'notFound' } };

  const parsed = readCustomerForm(formData);
  if (!parsed.success) return { errors: { form: 'generic' } };

  const result = await new UpdateCustomerUseCase(new DrizzleCustomerRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    customerId,
    profile: parsed.data,
    now: new Date(),
  });
  if (!result.ok) {
    const [field, key] = customerError(result.error);
    return { errors: { [field]: key } };
  }
  revalidatePath('/customers');
  return actionRedirect(`/customers/${customerId}?notice=saved`);
}

export async function setCustomerActiveAction(
  customerId: string,
  active: boolean,
): Promise<CustomerActionResult> {
  const user = await authorizeStore('customers.deactivate', { allowWhenReadOnly: !active });
  if (!user) return { ok: false, error: 'generic' };
  if (!idSchema.safeParse(customerId).success) return { ok: false, error: 'generic' };

  const result = await new SetCustomerActiveUseCase(new DrizzleCustomerRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    customerId,
    active,
    now: new Date(),
  });
  if (!result.ok)
    return { ok: false, error: result.error === 'HAS_BALANCE' ? 'hasBalance' : 'generic' };
  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function setCreditAccountStatusAction(
  customerId: string,
  status: 'ACTIVE' | 'SUSPENDED',
): Promise<CustomerActionResult> {
  const user = await authorizeStore('credit.terms', {
    allowWhenReadOnly: status === 'SUSPENDED',
  });
  if (!user) return { ok: false, error: 'generic' };
  if (!idSchema.safeParse(customerId).success) return { ok: false, error: 'generic' };

  const result = await new SetCreditAccountStatusUseCase(
    new DrizzleCreditAccountRepository(),
  ).execute({ storeId: user.storeId, actorId: user.id, customerId, status, now: new Date() });
  if (!result.ok) {
    return { ok: false, error: result.error === 'PLAN_LIMIT_REACHED' ? 'planLimit' : 'generic' };
  }
  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

/** US06: solo el dueño pacta o cambia las condiciones de crédito. */
export async function saveCreditTermsAction(
  customerId: string,
  customerName: string,
  _prev: TermsFormState,
  formData: FormData,
): Promise<TermsFormState> {
  const user = await authorizeStore('credit.terms');
  if (!user) return actionRedirect('/login');
  if (!idSchema.safeParse(customerId).success) return { errors: { form: 'generic' } };

  const parsed = termsFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: { form: 'generic' } };
  const form = parsed.data;

  const meta = await requestMeta();
  const evidence = await termsEvidence(customerName, form);
  const result = await new SaveCreditTermsUseCase(new DrizzleCreditAccountRepository()).execute({
    storeId: user.storeId,
    actorId: user.id,
    customerId,
    currency: form.currency,
    creditLimit: form.creditLimit,
    compensatory: {
      type: form.compensatoryType,
      percent: form.compensatoryPercent,
      period: form.compensatoryPeriod,
      capitalization: form.compensatoryCapitalization,
    },
    moratory: {
      type: form.moratoryType,
      percent: form.moratoryPercent,
      period: form.moratoryPeriod,
      capitalization: form.moratoryCapitalization,
    },
    cutOffDay: form.cutOffDay,
    paymentDueDay: form.paymentDueDay,
    maxInstallmentMonths: form.maxInstallmentMonths,
    consentText: evidence,
    ...meta,
    now: new Date(),
  });

  if (!result.ok) {
    const [field, key] = termsError(result.error);
    return { errors: { [field]: key } };
  }
  revalidatePath('/customers');
  return actionRedirect(
    `/customers/${customerId}?notice=${result.value === 'OPENED' ? 'termsOpened' : 'saved'}`,
  );
}

/** Resumen legible de lo pactado: queda como evidencia `CREDIT_TERMS` (D6). */
async function termsEvidence(name: string, form: TermsForm): Promise<string> {
  const t = await getTranslations('Customers.terms');
  const rate = (type: RateType, percent: string, period: RatePeriod, cap: RatePeriod | null) =>
    type === 'NOMINAL' && cap
      ? t('rateNominal', {
          percent: percent.trim(),
          period: t(`periodAdjective.${period}`),
          capitalization: t(`capitalizationAdverb.${cap}`),
        })
      : t('rateEffective', { percent: percent.trim(), period: t(`periodAdjective.${period}`) });

  let limit = form.creditLimit;
  try {
    limit = formatMoney(form.creditLimit.replace(/[\s,]/g, ''), form.currency);
  } catch {
    // El caso de uso rechazará el límite; la evidencia no llega a guardarse
  }
  return t('evidence', {
    name,
    limit,
    compensatory: rate(
      form.compensatoryType,
      form.compensatoryPercent,
      form.compensatoryPeriod,
      form.compensatoryCapitalization,
    ),
    moratory: rate(
      form.moratoryType,
      form.moratoryPercent,
      form.moratoryPeriod,
      form.moratoryCapitalization,
    ),
    cutOff: form.cutOffDay,
    payment: form.paymentDueDay,
    months: form.maxInstallmentMonths,
  });
}
