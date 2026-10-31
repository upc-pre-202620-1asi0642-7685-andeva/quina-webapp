import type { CustomerRepository } from '@/core/domain/ports/customer-repository';
import { err, ok, type Result } from '@/core/domain/shared/result';
import {
  parseCustomerProfile,
  type CustomerProfileError,
  type CustomerProfileInput,
} from './customer-profile';

export type UpdateCustomerCommand = {
  storeId: string;
  actorId: string;
  customerId: string;
  profile: CustomerProfileInput;
  now: Date;
};

export class UpdateCustomerUseCase {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(
    command: UpdateCustomerCommand,
  ): Promise<Result<void, CustomerProfileError | 'NOT_FOUND' | 'DOCUMENT_TAKEN'>> {
    const profile = parseCustomerProfile(command.profile);
    if (!profile.ok) return profile;
    const result = await this.customers.update({ ...command, profile: profile.value });
    return result === 'OK' ? ok(undefined) : err(result);
  }
}

export class SetCustomerActiveUseCase {
  constructor(private readonly customers: CustomerRepository) {}

  /** Dar de baja exige saldo cero y suspende la cuenta de crédito (D5). */
  async execute(command: {
    storeId: string;
    actorId: string;
    customerId: string;
    active: boolean;
    now: Date;
  }): Promise<Result<void, 'NOT_FOUND' | 'HAS_BALANCE'>> {
    const result = await this.customers.setActive(command);
    return result === 'OK' ? ok(undefined) : err(result);
  }
}
