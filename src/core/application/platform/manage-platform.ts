import type { RateKind } from '@/core/domain/credit/rate-cap';
import { RatePercent } from '@/core/domain/credit/rate-percent';
import { EmailAddress } from '@/core/domain/identity/email-address';
import { PersonName } from '@/core/domain/identity/person-name';
import { TaxId } from '@/core/domain/identity/tax-id';
import type { AccountSetupTokens } from '@/core/domain/ports/account-setup';
import type { NotificationMailer } from '@/core/domain/ports/notification-mailer';
import type {
  PlatformStoreRepository,
  RateCapRepository,
} from '@/core/domain/ports/platform-repository';
import { BusinessDate } from '@/core/domain/shared/business-date';
import type { Locale } from '@/core/domain/shared/locale';
import type { Currency } from '@/core/domain/shared/money';
import { err, ok, type Result } from '@/core/domain/shared/result';

export type CreateStoreCommand = {
  adminId: string;
  commercialName: string;
  businessTurn: string;
  taxId: string;
  ownerName: string;
  ownerEmail: string;
  locale: Locale;
  setupUrl: (token: string) => string;
  now: Date;
};

export type CreateStoreError =
  | 'COMMERCIAL_NAME_INVALID'
  | 'TAX_ID_INVALID'
  | 'NAME_INVALID'
  | 'EMAIL_INVALID'
  | 'TAX_ID_TAKEN'
  | 'EMAIL_TAKEN';

/** US01: el Administrador crea la tienda y su dueño define la contraseña con un enlace. */
export class CreateStoreUseCase {
  constructor(
    private readonly stores: PlatformStoreRepository,
    private readonly tokens: AccountSetupTokens,
    private readonly mailer: NotificationMailer,
  ) {}

  async execute(
    command: CreateStoreCommand,
  ): Promise<Result<{ storeId: string; mailSent: boolean }, CreateStoreError>> {
    const commercialName = command.commercialName.trim().replace(/\s+/g, ' ');
    if (commercialName.length < 2 || commercialName.length > 150) {
      return err('COMMERCIAL_NAME_INVALID');
    }
    const taxId = TaxId.parse(command.taxId);
    if (!taxId.ok) return taxId;
    const ownerName = PersonName.parse(command.ownerName);
    if (!ownerName.ok) return err('NAME_INVALID');
    const ownerEmail = EmailAddress.parse(command.ownerEmail);
    if (!ownerEmail.ok) return ownerEmail;

    const created = await this.stores.create({
      adminId: command.adminId,
      commercialName,
      businessTurn: command.businessTurn,
      taxId: taxId.value,
      ownerName: ownerName.value,
      ownerEmail: ownerEmail.value,
      locale: command.locale,
      now: command.now,
    });
    if (typeof created === 'string') return err(created);

    // D8: un fallo de correo no deshace la tienda; el Administrador puede reenviar
    let mailSent = true;
    try {
      const token = await this.tokens.issue(created.ownerId, command.now);
      await this.mailer.sendAccountSetup(
        {
          to: ownerEmail.value,
          locale: command.locale,
          audience: 'owner',
          name: ownerName.value,
          storeName: commercialName,
          url: command.setupUrl(token),
        },
        { storeId: created.storeId, userId: created.ownerId },
      );
    } catch {
      mailSent = false;
    }
    return ok({ storeId: created.storeId, mailSent });
  }
}

/** D8: si el correo al dueño falló o venció, el Administrador le manda uno nuevo. */
export class ResendOwnerLinkUseCase {
  constructor(
    private readonly stores: PlatformStoreRepository,
    private readonly tokens: AccountSetupTokens,
    private readonly mailer: NotificationMailer,
  ) {}

  async execute(command: {
    storeId: string;
    setupUrl: (token: string) => string;
    now: Date;
  }): Promise<Result<void, 'NOT_FOUND' | 'MAIL_FAILED'>> {
    const owner = await this.stores.findPendingOwner(command.storeId);
    if (!owner) return err('NOT_FOUND');
    const token = await this.tokens.issue(owner.userId, command.now);
    try {
      await this.mailer.sendAccountSetup(
        {
          to: owner.email,
          locale: owner.locale,
          audience: 'owner',
          name: owner.name,
          storeName: owner.storeName,
          url: command.setupUrl(token),
        },
        { storeId: command.storeId, userId: owner.userId },
      );
    } catch {
      return err('MAIL_FAILED');
    }
    return ok(undefined);
  }
}

export class SetStoreActiveUseCase {
  constructor(private readonly stores: PlatformStoreRepository) {}

  async execute(command: {
    adminId: string;
    storeId: string;
    active: boolean;
    now: Date;
  }): Promise<Result<void, 'NOT_FOUND'>> {
    const result = await this.stores.setActive(command);
    return result === 'OK' ? ok(undefined) : err(result);
  }
}

export type AddRateCapCommand = {
  adminId: string;
  kind: RateKind;
  currency: Currency;
  /** Tasa efectiva anual en porcentaje, como la publica el BCRP. */
  percent: string;
  validFrom: string;
  source: string;
  now: Date;
};

export type AddRateCapError =
  | 'RATE_PERCENT_INVALID'
  | 'RATE_NOT_POSITIVE'
  | 'DATE_INVALID'
  | 'SOURCE_REQUIRED'
  | 'NOT_AFTER_CURRENT';

/** Decisión 4: el Administrador registra cada nueva circular del BCRP. */
export class AddRateCapUseCase {
  constructor(private readonly caps: RateCapRepository) {}

  async execute(command: AddRateCapCommand): Promise<Result<void, AddRateCapError>> {
    const fraction = RatePercent.toFraction(command.percent);
    if (!fraction.ok) return fraction;
    if (/^0\.0+$/.test(fraction.value)) return err('RATE_NOT_POSITIVE');
    let validFrom: BusinessDate;
    try {
      validFrom = BusinessDate.parse(command.validFrom);
    } catch {
      return err('DATE_INVALID');
    }
    const source = command.source.trim();
    if (source.length < 5) return err('SOURCE_REQUIRED');

    const result = await this.caps.add({
      adminId: command.adminId,
      cap: {
        kind: command.kind,
        currency: command.currency,
        maxEffectiveAnnualRate: fraction.value,
        validFrom,
      },
      source,
      now: command.now,
    });
    return result === 'OK' ? ok(undefined) : err(result);
  }
}
