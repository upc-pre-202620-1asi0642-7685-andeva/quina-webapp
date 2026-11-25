import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deliverPushBatch } from '@/core/application/notifications/dispatch-store-push';
import {
  buildChargeObjectedPushPayload,
  buildDailyPushPayload,
  buildTestPushPayload,
} from '@/core/domain/notifications/push-messages';
import type {
  PushNotifier,
  PushPayload,
  PushSubscriptionInput,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/core/domain/ports/push-notifier';
import { OutboxPushGateway } from '@/infrastructure/push/outbox-push-gateway';
import {
  createPushNotifier,
  getVapidPublicKey,
  isPushConfigured,
  resolvePushTransport,
} from '@/infrastructure/push/push-gateway-factory';

function sub(id: string, locale: 'es' | 'en' | 'qu' = 'es'): PushSubscriptionRecord {
  return {
    id,
    storeId: 'store-1',
    userId: `user-${id}`,
    endpoint: `https://push.example.test/${id}`,
    p256dh:
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8',
    auth: 'tBHItJI5svbpez7KI4CCXg',
    locale,
  };
}

class InMemoryPushRepo implements PushSubscriptionRepository {
  rows: PushSubscriptionRecord[] = [];
  removedIds: string[] = [];
  sentIds: string[] = [];
  errors: { id: string; message: string }[] = [];

  async upsert(input: PushSubscriptionInput) {
    this.rows.push({
      id: `sub-${this.rows.length + 1}`,
      storeId: input.storeId,
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      locale: input.locale,
    });
  }
  async removeByEndpoint(_s: string, _u: string, endpoint: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.endpoint !== endpoint);
    return before - this.rows.length;
  }
  async removeByIds(_s: string, ids: readonly string[]) {
    this.removedIds.push(...ids);
    const set = new Set(ids);
    this.rows = this.rows.filter((r) => !set.has(r.id));
  }
  async listForStore() {
    return this.rows;
  }
  async listForUser(_s: string, userId: string) {
    return this.rows.filter((r) => r.userId === userId);
  }
  async countForUser(_s: string, userId: string) {
    return this.rows.filter((r) => r.userId === userId).length;
  }
  async markSent(_s: string, ids: readonly string[]) {
    this.sentIds.push(...ids);
  }
  async markError(_s: string, id: string, message: string) {
    this.errors.push({ id, message });
  }
}

describe('mensajes Web Push (es, en, qu)', () => {
  it('devuelve null cuando no hay alertas accionables', () => {
    const payload = buildDailyPushPayload(
      'es',
      {
        storeName: 'Bodega Sol',
        overdueCount: 0,
        dueSoonCount: 0,
        lowStockCount: 0,
        isReadOnly: false,
        graceDaysRemaining: null,
        trialDaysRemaining: 10,
        canViewBilling: true,
        canViewCollections: true,
        canViewStock: true,
      },
      '2026-11-24',
    );
    expect(payload).toBeNull();
  });

  it('arma el resumen diario respetando permisos y priorizando Cobranza', () => {
    const employee = buildDailyPushPayload(
      'es',
      {
        storeName: 'Bodega Sol',
        overdueCount: 2,
        dueSoonCount: 1,
        lowStockCount: 3,
        isReadOnly: true,
        graceDaysRemaining: 2,
        trialDaysRemaining: 1,
        canViewBilling: false,
        canViewCollections: true,
        canViewStock: true,
      },
      '2026-11-24',
    );
    expect(employee).toEqual({
      title: 'Quina · Resumen del día · Bodega Sol',
      body: '2 cobros vencidos · 1 cobro por vencer · 3 productos por agotarse',
      url: '/app/collections',
      tag: 'quina-daily-2026-11-24',
    });

    const ownerBillingOnly = buildDailyPushPayload(
      'en',
      {
        storeName: 'Bodega Sol',
        overdueCount: 0,
        dueSoonCount: 0,
        lowStockCount: 0,
        isReadOnly: false,
        graceDaysRemaining: null,
        trialDaysRemaining: 2,
        canViewBilling: true,
        canViewCollections: false,
        canViewStock: false,
      },
      '2026-11-24',
    );
    expect(ownerBillingOnly?.url).toBe('/app/settings/subscription');
    expect(ownerBillingOnly?.body).toContain('2 days left on your Pro trial');
  });

  it('arma avisos de cargo observado y de prueba en los tres idiomas', () => {
    const objected = buildChargeObjectedPushPayload('qu', {
      customerName: 'Rosa',
      storeName: 'Bodega Sol',
      customerId: 'cust-1',
      cycleId: 'cyc-1',
    });
    expect(objected.url).toBe('/app/customers/cust-1/cycles/cyc-1');
    expect(objected.body).toContain('Rosa');

    expect(buildTestPushPayload('es', 'Bodega Sol').url).toBe('/app/profile/preferences');
  });
});

describe('deliverPushBatch', () => {
  it('envía, marca enviados, guarda errores y depura suscripciones expiradas (404/410)', async () => {
    const repo = new InMemoryPushRepo();
    repo.rows = [sub('ok'), sub('gone'), sub('err')];

    const notifier: PushNotifier = {
      async send(s) {
        if (s.id === 'ok') return { status: 'SENT' };
        if (s.id === 'gone') return { status: 'EXPIRED', errorMessage: '410 Gone' };
        return { status: 'FAILED', errorMessage: 'network timeout' };
      },
    };

    const payload: PushPayload = { title: 'Quina', body: 'Test', url: '/app/collections' };
    const summary = await deliverPushBatch(repo, notifier, 'store-1', repo.rows, () => payload);

    expect(summary).toEqual({ sent: 1, failed: 1, expired: 1 });
    expect(repo.sentIds).toEqual(['ok']);
    expect(repo.removedIds).toEqual(['gone']);
    expect(repo.errors).toEqual([{ id: 'err', message: 'network timeout' }]);
    expect(repo.rows.map((r) => r.id)).toEqual(['ok', 'err']);
  });
});

describe('push-gateway-factory y OutboxPushGateway', () => {
  it('elige outbox en desarrollo sin llaves VAPID y prohíbe outbox en VERCEL_ENV=production', () => {
    expect(resolvePushTransport({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('outbox');
    expect(isPushConfigured({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isPushConfigured({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(createPushNotifier({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeNull();
    expect(() =>
      resolvePushTransport({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        PUSH_TRANSPORT: 'outbox',
      } as NodeJS.ProcessEnv),
    ).toThrow(/VERCEL_ENV=production/);
    expect(
      getVapidPublicKey({ NODE_ENV: 'test', VAPID_PUBLIC_KEY: '  abc123  ' } as NodeJS.ProcessEnv),
    ).toBe('abc123');
  });

  it('OutboxPushGateway escribe archivos JSON legibles en .outbox', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'quina-push-'));
    try {
      const gateway = new OutboxPushGateway(dir);
      const outcome = await gateway.send(sub('u1'), {
        title: 'Quina',
        body: 'Cobro pendiente',
        url: '/app/collections',
      });
      expect(outcome).toEqual({ status: 'SENT' });
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      const saved = JSON.parse(await readFile(path.join(dir, files[0]!), 'utf8')) as {
        payload: PushPayload;
      };
      expect(saved.payload.body).toBe('Cobro pendiente');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
