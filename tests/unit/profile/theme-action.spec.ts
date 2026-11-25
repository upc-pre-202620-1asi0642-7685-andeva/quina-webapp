import { beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '@/infrastructure/db/schema';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  revalidatePath: vi.fn(),
  userUpdates: [] as Record<string, unknown>[],
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

vi.mock('@/infrastructure/db/connection', () => ({
  db: {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === users) mocks.userUpdates.push(values);
        },
      }),
    }),
  },
}));

import { setThemeAction } from '@/presentation/actions/theme';

describe('setThemeAction', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.userUpdates = [];
  });

  it('redirige a /login si no hay sesión', async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const res = await setThemeAction('dark');
    expect(res).toEqual({ redirectedTo: '/login' });
    expect(mocks.userUpdates).toHaveLength(0);
  });

  it('rechaza valores de tema inválidos', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'u-1' });
    const res = await setThemeAction('sepia');
    expect(res).toEqual({ ok: false });
    expect(mocks.userUpdates).toHaveLength(0);
  });

  it('guarda preferredTheme en users y revalida el layout', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'u-1' });
    const res = await setThemeAction('dark');
    expect(res).toEqual({ ok: true, theme: 'dark' });
    expect(mocks.userUpdates).toHaveLength(1);
    expect(mocks.userUpdates[0]?.preferredTheme).toBe('dark');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
