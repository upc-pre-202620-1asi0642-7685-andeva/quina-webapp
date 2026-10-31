import type { Subscription } from '@/core/domain/billing/plan-limits';
import type { ConsentRecord } from '@/core/domain/credit/customer-consent';
import type { RateCap } from '@/core/domain/credit/rate-cap';
import type {
  CreditAccountRepository,
  CreditAccountStatus,
  CreditAccountTerms,
  SaveTermsData,
  SaveTermsResult,
  SetAccountStatusData,
} from '@/core/domain/ports/credit-account-repository';
import type {
  CustomerProfile,
  CustomerRepository,
  RegisterCustomerData,
  SetCustomerActiveData,
  UpdateCustomerData,
} from '@/core/domain/ports/customer-repository';
import type { MailContext, NotificationMailer } from '@/core/domain/ports/notification-mailer';

type FakeCustomer = { storeId: string; profile: CustomerProfile; active: boolean };
type FakeAccount = {
  storeId: string;
  terms: CreditAccountTerms;
  status: CreditAccountStatus;
  balance: string;
};

/** Una sola "base" en memoria para vecinos, cuentas y consentimientos. */
export class InMemoryCustomerStore implements CustomerRepository, CreditAccountRepository {
  readonly customers = new Map<string, FakeCustomer>();
  readonly accounts = new Map<string, FakeAccount>();
  readonly consents: (ConsentRecord & { customerId: string })[] = [];
  readonly subscriptions = new Map<string, Subscription>();
  caps: RateCap[] = [];
  private nextId = 1;

  async register(data: RegisterCustomerData): Promise<{ customerId: string } | 'DOCUMENT_TAKEN'> {
    if (this.findDocument(data.storeId, data.profile) !== undefined) return 'DOCUMENT_TAKEN';
    const customerId = `c-${this.nextId++}`;
    this.customers.set(customerId, { storeId: data.storeId, profile: data.profile, active: true });
    this.consents.push({ ...data.consent, customerId });
    return { customerId };
  }

  async update(data: UpdateCustomerData): Promise<'OK' | 'NOT_FOUND' | 'DOCUMENT_TAKEN'> {
    const customer = this.customerOf(data.storeId, data.customerId);
    if (!customer) return 'NOT_FOUND';
    const owner = this.findDocument(data.storeId, data.profile);
    if (owner !== undefined && owner !== data.customerId) return 'DOCUMENT_TAKEN';
    customer.profile = data.profile;
    return 'OK';
  }

  async setActive(data: SetCustomerActiveData): Promise<'OK' | 'NOT_FOUND' | 'HAS_BALANCE'> {
    const customer = this.customerOf(data.storeId, data.customerId);
    if (!customer) return 'NOT_FOUND';
    const account = this.accounts.get(data.customerId);
    if (!data.active && account) {
      if (account.balance !== '0.00') return 'HAS_BALANCE';
      account.status = 'SUSPENDED';
    }
    customer.active = data.active;
    return 'OK';
  }

  async rateCaps(): Promise<RateCap[]> {
    return this.caps;
  }

  async saveTerms(data: SaveTermsData): Promise<SaveTermsResult> {
    const customer = this.customerOf(data.storeId, data.customerId);
    if (!customer) return 'NOT_FOUND';
    if (!customer.active) return 'CUSTOMER_INACTIVE';
    const existing = this.accounts.get(data.customerId);
    if (existing) {
      if (existing.terms.currency !== data.terms.currency && existing.balance !== '0.00') {
        return 'CURRENCY_LOCKED';
      }
      existing.terms = data.terms;
      this.consents.push({ ...data.consent, customerId: data.customerId });
      return 'UPDATED';
    }
    if (!data.canOpen(this.subscriptionOf(data.storeId), this.activeAccounts(data.storeId))) {
      return 'PLAN_LIMIT_REACHED';
    }
    this.accounts.set(data.customerId, {
      storeId: data.storeId,
      terms: data.terms,
      status: 'ACTIVE',
      balance: '0.00',
    });
    this.consents.push({ ...data.consent, customerId: data.customerId });
    return 'OPENED';
  }

  async setStatus(data: SetAccountStatusData): Promise<'OK' | 'NOT_FOUND' | 'PLAN_LIMIT_REACHED'> {
    const account = this.accounts.get(data.customerId);
    if (!account || account.storeId !== data.storeId) return 'NOT_FOUND';
    if (
      data.status === 'ACTIVE' &&
      account.status !== 'ACTIVE' &&
      !data.canOpen(this.subscriptionOf(data.storeId), this.activeAccounts(data.storeId))
    ) {
      return 'PLAN_LIMIT_REACHED';
    }
    account.status = data.status;
    return 'OK';
  }

  private customerOf(storeId: string, customerId: string): FakeCustomer | undefined {
    const customer = this.customers.get(customerId);
    return customer?.storeId === storeId ? customer : undefined;
  }

  private findDocument(storeId: string, profile: CustomerProfile): string | undefined {
    for (const [id, c] of this.customers) {
      if (
        c.storeId === storeId &&
        c.profile.document.type === profile.document.type &&
        c.profile.document.number === profile.document.number
      ) {
        return id;
      }
    }
    return undefined;
  }

  private activeAccounts(storeId: string): number {
    return [...this.accounts.values()].filter((a) => a.storeId === storeId && a.status === 'ACTIVE')
      .length;
  }

  private subscriptionOf(storeId: string): Subscription {
    return (
      this.subscriptions.get(storeId) ?? { planTier: 'CASERO', status: 'ACTIVE', trialEndsAt: null }
    );
  }
}

type SentMail = { kind: 'welcome' | 'setup'; to: string; context: MailContext; data: unknown };

export class FakeNotificationMailer implements NotificationMailer {
  readonly sent: SentMail[] = [];
  failing = false;

  async sendCustomerWelcome(
    input: Parameters<NotificationMailer['sendCustomerWelcome']>[0],
    context: MailContext,
  ): Promise<void> {
    if (this.failing) throw new Error('Resend caído');
    this.sent.push({ kind: 'welcome', to: input.to, context, data: input });
  }

  async sendAccountSetup(
    input: Parameters<NotificationMailer['sendAccountSetup']>[0],
    context: MailContext,
  ): Promise<void> {
    if (this.failing) throw new Error('Resend caído');
    this.sent.push({ kind: 'setup', to: input.to, context, data: input });
  }
}
