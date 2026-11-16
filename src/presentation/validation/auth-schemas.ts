import { z } from 'zod';
import { MobilePhone } from '@/core/domain/identity/mobile-phone';
import { PasswordPolicy } from '@/core/domain/identity/password-policy';
import { PersonName } from '@/core/domain/identity/person-name';
import { TaxId } from '@/core/domain/identity/tax-id';

export const BUSINESS_TURNS = ['BODEGA', 'BOTICA', 'CARNICERIA', 'PANADERIA', 'OTRO'] as const;
export type BusinessTurn = (typeof BUSINESS_TURNS)[number];

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'emailInvalid' }));

const passwordField = z
  .string()
  .refine((value) => PasswordPolicy.check(value).ok, { message: 'passwordWeak' });

const personNameField = z.string().transform((raw, ctx) => {
  const parsed = PersonName.parse(raw);
  if (!parsed.ok) {
    ctx.addIssue({
      code: 'custom',
      message: parsed.error === 'NAME_REQUIRED' ? 'nameRequired' : 'nameInvalid',
    });
    return z.NEVER;
  }
  return parsed.value;
});

const optionalPhoneField = z.string().transform((raw, ctx) => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = MobilePhone.parse(trimmed);
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: 'phoneInvalid' });
    return z.NEVER;
  }
  return parsed.value;
});

export const accountSchema = z.object({
  name: personNameField,
  email: emailField,
  password: passwordField,
});

export const storeSchema = z.object({
  commercialName: z
    .string()
    .trim()
    .min(2, { message: 'commercialNameRequired' })
    .max(150, { message: 'commercialNameRequired' }),
  businessTurn: z.enum(BUSINESS_TURNS, { message: 'businessTurnInvalid' }),
  taxId: z.string().transform((raw, ctx) => {
    const parsed = TaxId.parse(raw);
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: 'taxIdInvalid' });
      return z.NEVER;
    }
    return parsed.value.number;
  }),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, { message: 'passwordRequired' }),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  password: passwordField,
});

// Crear contraseña desde el perfil (cuentas que entraron con Google)
export const setPasswordSchema = z
  .object({ password: passwordField, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: personNameField,
  phone: optionalPhoneField,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'passwordRequired' }),
    newPassword: passwordField,
    confirmPassword: z.string(),
    revokeOtherSessions: z.boolean().default(false),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export type AccountInput = z.infer<typeof accountSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
