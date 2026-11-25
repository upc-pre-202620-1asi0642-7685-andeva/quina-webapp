import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stores, users } from '@/infrastructure/db/schema';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  withTenant: vi.fn(),
  revalidatePath: vi.fn(),
  selectResult: [] as { name: string; phone: string | null }[],
  userUpdates: [] as Record<string, unknown>[],
  storeUpdates: [] as Record<string, unknown>[],
  auditInserts: [] as Record<string, unknown>[],
  headers: new Headers({ 'user-agent': 'Vitest/1.0', 'x-forwarded-for': '203.0.113.10' }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => mocks.headers),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/presentation/lib/action-redirect', () => ({
  actionRedirect: vi.fn((path: string) => ({ redirectedTo: path })),
}));

vi.mock('@/presentation/auth/session', () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock('@/infrastructure/db/with-tenant', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@/infrastructure/db/connection', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mocks.selectResult,
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === users) mocks.userUpdates.push(values);
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        mocks.auditInserts.push(values);
      },
    }),
  },
}));

import { updateProfileAction } from '@/presentation/actions/profile';

describe('updateProfileAction (RBAC, validación y sincronización de dueño)', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset();
    mocks.withTenant.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.selectResult = [];
    mocks.userUpdates = [];
    mocks.storeUpdates = [];
    mocks.auditInserts = [];

    mocks.withTenant.mockImplementation(
      async (_storeId: string, fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          update: (table: unknown) => ({
            set: (values: Record<string, unknown>) => ({
              where: async () => {
                if (table === stores) mocks.storeUpdates.push(values);
              },
            }),
          }),
          insert: () => ({
            values: async (values: Record<string, unknown>) => {
              mocks.auditInserts.push(values);
            },
          }),
        };
        return fn(tx);
      },
    );
  });

  it('redirige a /login si no hay sesión verificada', async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const fd = new FormData();
    fd.set('name', 'Carmen Rojas');
    fd.set('phone', '');
    const res = await updateProfileAction({}, fd);
    expect(res).toEqual({ redirectedTo: '/login' });
  });

  it('rechaza entradas inválidas con fieldErrors antes de tocar la base', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'u-1',
      name: 'Carmen Rojas',
      email: 'carmen@bodega.pe',
      emailVerified: true,
      role: 'STORE_OWNER',
      storeId: 's-1',
      preferredLocale: 'es',
      preferredTheme: 'system',
    });

    const fd = new FormData();
    fd.set('name', '1');
    fd.set('phone', '700000000');
    const res = await updateProfileAction({}, fd);
    expect(res.fieldErrors).toEqual({ name: 'nameRequired', phone: 'phoneInvalid' });
    expect(mocks.userUpdates).toHaveLength(0);
  });

  it('STORE_OWNER sincroniza users.name y stores.ownerFullName dentro de withTenant y audita', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'u-1',
      name: 'Carmen Rojas',
      email: 'carmen@bodega.pe',
      emailVerified: true,
      role: 'STORE_OWNER',
      storeId: 's-1',
      preferredLocale: 'es',
      preferredTheme: 'system',
    });
    mocks.selectResult = [{ name: 'Carmen Rojas', phone: null }];

    const fd = new FormData();
    fd.set('name', 'Carmen Elena Rojas');
    fd.set('phone', '+51 987 654 321');
    const res = await updateProfileAction({}, fd);

    expect(res).toEqual({ ok: true, savedName: 'Carmen Elena Rojas', savedPhone: '987654321' });
    expect(mocks.userUpdates).toHaveLength(1);
    expect(mocks.withTenant).toHaveBeenCalledWith('s-1', expect.any(Function));
    expect(mocks.storeUpdates).toHaveLength(1);
    expect(mocks.storeUpdates[0]?.ownerFullName).toBe('Carmen Elena Rojas');
    expect(mocks.auditInserts).toHaveLength(1);
    expect(mocks.auditInserts[0]?.action).toBe('UPDATE_PROFILE');
  });

  it('STORE_EMPLOYEE actualiza solo users y nunca modifica stores.ownerFullName', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'u-2',
      name: 'Luis Vega',
      email: 'luis@bodega.pe',
      emailVerified: true,
      role: 'STORE_EMPLOYEE',
      storeId: 's-1',
      preferredLocale: 'es',
      preferredTheme: 'system',
    });
    mocks.selectResult = [{ name: 'Luis Vega', phone: null }];

    const fd = new FormData();
    fd.set('name', 'Luis Alberto Vega');
    fd.set('phone', '912345678');
    const res = await updateProfileAction({}, fd);

    expect(res).toEqual({ ok: true, savedName: 'Luis Alberto Vega', savedPhone: '912345678' });
    expect(mocks.userUpdates).toHaveLength(1);
    expect(mocks.withTenant).toHaveBeenCalledWith('s-1', expect.any(Function));
    expect(mocks.storeUpdates).toHaveLength(0);
    expect(mocks.auditInserts).toHaveLength(1);
  });

  it('PLATFORM_ADMIN actualiza su perfil sin usar withTenant y guarda auditoría de plataforma', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'u-admin',
      name: 'Admin Quina',
      email: 'admin@quina.pe',
      emailVerified: true,
      role: 'PLATFORM_ADMIN',
      storeId: null,
      preferredLocale: 'es',
      preferredTheme: 'system',
    });
    mocks.selectResult = [{ name: 'Admin Quina', phone: null }];

    const fd = new FormData();
    fd.set('name', 'Admin Principal');
    fd.set('phone', '');
    const res = await updateProfileAction({}, fd);

    expect(res).toEqual({ ok: true, savedName: 'Admin Principal', savedPhone: null });
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.storeUpdates).toHaveLength(0);
    expect(mocks.auditInserts).toHaveLength(1);
    expect(mocks.auditInserts[0]?.storeId).toBeNull();
  });
});
