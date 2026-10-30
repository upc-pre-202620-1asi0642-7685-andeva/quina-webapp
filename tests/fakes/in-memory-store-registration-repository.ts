import type {
  CreateStoreForOwnerData,
  CreateStoreForOwnerResult,
  StoreRegistrationRepository,
} from '@/core/domain/ports/store-registration-repository';

type FakeUser = { role: string; storeId: string | null };

export class InMemoryStoreRegistrationRepository implements StoreRegistrationRepository {
  readonly users = new Map<string, FakeUser>();
  readonly stores: CreateStoreForOwnerData[] = [];

  addUser(userId: string, role = 'PENDING_OWNER', storeId: string | null = null): void {
    this.users.set(userId, { role, storeId });
  }

  async createStoreForOwner(data: CreateStoreForOwnerData): Promise<CreateStoreForOwnerResult> {
    const user = this.users.get(data.userId);
    if (user?.role === 'STORE_OWNER' && user.storeId) {
      return { storeId: user.storeId, created: false };
    }
    if (user?.role !== 'PENDING_OWNER') return 'USER_NOT_PENDING';
    if (this.stores.some((s) => s.taxIdNumber === data.taxIdNumber)) return 'TAX_ID_TAKEN';
    if (this.stores.some((s) => s.contactEmail === data.contactEmail)) return 'EMAIL_TAKEN';
    this.stores.push(data);
    this.users.set(data.userId, { role: 'STORE_OWNER', storeId: data.storeId });
    return { storeId: data.storeId, created: true };
  }
}
