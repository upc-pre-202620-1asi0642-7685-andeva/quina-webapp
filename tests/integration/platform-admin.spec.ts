import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { readAccountSetup } from '@/infrastructure/auth/account-setup';
import { closeDb } from '@/infrastructure/db/connection';
import { createPlatformAdmin } from '../../scripts/create-platform-admin';
import { testEnv } from './env';

afterAll(async () => {
  await closeDb();
});

const run = (email: string) =>
  createPlatformAdmin({
    url: testEnv.appUrl,
    appUrl: 'http://localhost:3100/app',
    email,
    name: 'Admin Quina',
  });

describe('pnpm db:admin', () => {
  it('emite un enlace que la webapp reconoce y lo renueva si se repite', async () => {
    const email = `admin-${randomUUID().slice(0, 8)}@andeva.test`;
    const first = new URL(await run(email)).searchParams.get('token') ?? '';
    expect(await readAccountSetup(first, new Date())).toMatchObject({ email, storeName: null });

    const second = new URL(await run(email.toUpperCase())).searchParams.get('token') ?? '';
    expect(await readAccountSetup(first, new Date())).toBeNull();
    expect(await readAccountSetup(second, new Date())).toMatchObject({ email });
  });
});
