import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/infrastructure/db/connection';
import { pushSubscriptions } from '@/infrastructure/db/schema';
import { DrizzlePushRepository } from '@/infrastructure/push/drizzle-push-repository';
import { storeWithOwner } from './support/seed';

afterAll(async () => {
  await closeDb();
});

describe('push_subscriptions (RLS y ciclo de vida)', () => {
  it('aísla las suscripciones por tienda y permite registrar, contar y borrar', async () => {
    const storeA = await storeWithOwner();
    const storeB = await storeWithOwner();
    const repo = new DrizzlePushRepository();

    await repo.upsert({
      storeId: storeA.storeId,
      userId: storeA.ownerId,
      endpoint: 'https://push.example.test/device-a',
      keys: { p256dh: 'p256dh-key-a-12345', auth: 'auth-key-a' },
      userAgent: 'Mozilla/5.0',
      locale: 'es',
    });

    await repo.upsert({
      storeId: storeB.storeId,
      userId: storeB.ownerId,
      endpoint: 'https://push.example.test/device-b',
      keys: { p256dh: 'p256dh-key-b-12345', auth: 'auth-key-b' },
      userAgent: 'Mozilla/5.0',
      locale: 'en',
    });

    // Sin withTenant, quina_app no ve ninguna fila
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);

    // Cada tienda ve solo sus propios dispositivos
    const listA = await repo.listForStore(storeA.storeId);
    expect(listA).toHaveLength(1);
    expect(listA[0]?.endpoint).toBe('https://push.example.test/device-a');

    expect(await repo.countForUser(storeA.storeId, storeA.ownerId)).toBe(1);

    // Actualizar las llaves del mismo endpoint hace upsert sin duplicar
    await repo.upsert({
      storeId: storeA.storeId,
      userId: storeA.ownerId,
      endpoint: 'https://push.example.test/device-a',
      keys: { p256dh: 'p256dh-key-a-updated', auth: 'auth-key-a-2' },
      locale: 'qu',
    });
    const updatedA = await repo.listForUser(storeA.storeId, storeA.ownerId);
    expect(updatedA).toHaveLength(1);
    expect(updatedA[0]?.p256dh).toBe('p256dh-key-a-updated');
    expect(updatedA[0]?.locale).toBe('qu');

    // Al cerrar sesión se elimina la suscripción del dispositivo
    const removed = await repo.removeByEndpoint(
      storeA.storeId,
      storeA.ownerId,
      'https://push.example.test/device-a',
    );
    expect(removed).toBe(1);
    expect(await repo.countForUser(storeA.storeId, storeA.ownerId)).toBe(0);
    // La tienda B permanece intacta
    expect(await repo.countForUser(storeB.storeId, storeB.ownerId)).toBe(1);
  });
});
