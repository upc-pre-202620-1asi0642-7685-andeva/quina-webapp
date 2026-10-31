import { CUSTOMER_PRIVACY_VERSION } from '@/core/domain/credit/customer-consent';
import type { CustomerRepository } from '@/core/domain/ports/customer-repository';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import type { Locale } from '@/core/domain/shared/locale';
import { err, ok, type Result } from '@/core/domain/shared/result';
import {
  parseCustomerProfile,
  type CustomerProfileError,
  type CustomerProfileInput,
} from './customer-profile';

export type RegisterCustomerCommand = {
  storeId: string;
  storeName: string;
  storeLocale: Locale;
  actorId: string;
  profile: CustomerProfileInput;
  /** US04 crit. 3: sin la casilla marcada no se registra. */
  consentAccepted: boolean;
  consentText: string;
  ip: string;
  userAgent: string;
  privacyUrl: string;
  now: Date;
};

export type RegisterCustomerError = CustomerProfileError | 'CONSENT_REQUIRED' | 'DOCUMENT_TAKEN';

export class RegisterCustomerUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly mailer: NotificationMailer,
  ) {}

  async execute(
    command: RegisterCustomerCommand,
  ): Promise<Result<{ customerId: string; welcomeSent: boolean }, RegisterCustomerError>> {
    if (!command.consentAccepted) return err('CONSENT_REQUIRED');
    const profile = parseCustomerProfile(command.profile);
    if (!profile.ok) return profile;

    const created = await this.customers.register({
      storeId: command.storeId,
      actorId: command.actorId,
      profile: profile.value,
      consent: {
        type: 'DATA_PROTECTION_LAW_29733',
        version: CUSTOMER_PRIVACY_VERSION,
        text: command.consentText,
        ip: command.ip,
        userAgent: command.userAgent,
      },
      now: command.now,
    });
    if (created === 'DOCUMENT_TAKEN') return err('DOCUMENT_TAKEN');

    // US04 crit. 6: si el correo falla, el registro igual queda hecho (D8)
    let welcomeSent = true;
    try {
      await this.mailer.sendCustomerWelcome(
        {
          to: profile.value.email,
          locale: profile.value.preferredLocale ?? command.storeLocale,
          customerName: profile.value.firstName,
          storeName: command.storeName,
          privacyUrl: command.privacyUrl,
        },
        { storeId: command.storeId, customerId: created.customerId },
      );
    } catch {
      welcomeSent = false;
    }
    return ok({ customerId: created.customerId, welcomeSent });
  }
}
