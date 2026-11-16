import { z } from 'zod';
import { EmailAddress } from '@/core/domain/identity/email-address';
import { PersonName } from '@/core/domain/identity/person-name';

export const inviteEmployeeSchema = z.object({
  name: z.string().transform((raw, ctx) => {
    const parsed = PersonName.parse(raw);
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: 'nameInvalid' });
      return z.NEVER;
    }
    return parsed.value;
  }),
  email: z.string().transform((raw, ctx) => {
    const parsed = EmailAddress.parse(raw);
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: 'emailInvalid' });
      return z.NEVER;
    }
    return parsed.value;
  }),
});

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;

export const memberIdSchema = z.uuid();
