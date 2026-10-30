import { z } from 'zod';
import { PasswordPolicy } from '@/core/domain/identity/password-policy';
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

export const accountSchema = z.object({
  name: z.string().trim().min(2, { message: 'nameRequired' }).max(150, { message: 'nameRequired' }),
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

export type AccountInput = z.infer<typeof accountSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
