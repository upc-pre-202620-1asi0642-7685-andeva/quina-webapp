import { TaxId } from '@/core/domain/identity/tax-id';
import type { StoreRegistrationRepository } from '@/core/domain/ports/store-registration-repository';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type RegisterStoreInput = {
  userId: string;
  commercialName: string;
  businessTurn: string;
  taxId: string;
  ownerFullName: string;
  contactEmail: string;
  ip?: string;
  userAgent?: string;
  now: Date;
};

export type RegisterStoreError =
  'TAX_ID_INVALID' | 'TAX_ID_TAKEN' | 'EMAIL_TAKEN' | 'USER_NOT_PENDING';

export const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export class RegisterStoreUseCase {
  constructor(private readonly repository: StoreRegistrationRepository) {}

  async execute(
    input: RegisterStoreInput,
  ): Promise<Result<{ storeId: string }, RegisterStoreError>> {
    const taxId = TaxId.parse(input.taxId);
    if (!taxId.ok) return err('TAX_ID_INVALID');

    const result = await this.repository.createStoreForOwner({
      userId: input.userId,
      storeId: crypto.randomUUID(),
      commercialName: input.commercialName.trim(),
      businessTurn: input.businessTurn,
      taxIdType: taxId.value.type,
      taxIdNumber: taxId.value.number,
      ownerFullName: input.ownerFullName,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      ip: input.ip,
      userAgent: input.userAgent,
      now: input.now,
      trialEndsAt: new Date(input.now.getTime() + TRIAL_DAYS * DAY_MS),
    });
    if (typeof result === 'string') return err(result);
    return ok({ storeId: result.storeId });
  }
}
