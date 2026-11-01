import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { emailEventOf, verifyResendSignature } from '@/presentation/lib/resend-webhook';

const secretBytes = Buffer.from('quina-secreto-de-prueba');
const secret = `whsec_${secretBytes.toString('base64')}`;
const now = new Date('2026-11-01T12:00:00Z');
const timestamp = String(Math.floor(now.getTime() / 1000));
const body = '{"type":"email.bounced"}';
const sign = (id: string, ts: string, text: string) =>
  `v1,${createHmac('sha256', secretBytes).update(`${id}.${ts}.${text}`).digest('base64')}`;

describe('verifyResendSignature', () => {
  it('acepta una firma válida, aunque venga junto a otras', () => {
    const signature = `v1,b3RyYQ== ${sign('msg_1', timestamp, body)}`;
    expect(verifyResendSignature({ secret, id: 'msg_1', timestamp, signature, body, now })).toBe(
      true,
    );
  });

  it('rechaza un cuerpo alterado, un secreto vacío o una firma vieja', () => {
    const signature = sign('msg_1', timestamp, body);
    expect(
      verifyResendSignature({ secret, id: 'msg_1', timestamp, signature, body: '{}', now }),
    ).toBe(false);
    expect(
      verifyResendSignature({ secret: undefined, id: 'msg_1', timestamp, signature, body, now }),
    ).toBe(false);
    const later = new Date(now.getTime() + 6 * 60 * 1000);
    expect(
      verifyResendSignature({ secret, id: 'msg_1', timestamp, signature, body, now: later }),
    ).toBe(false);
  });
});

describe('emailEventOf', () => {
  const storeId = '3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f';

  it('lee el rebote de un correo de cobranza con su tienda', () => {
    expect(
      emailEventOf({
        type: 'email.bounced',
        created_at: '2026-11-01T12:00:00Z',
        data: { email_id: 'em_1', tags: { store_id: storeId, kind: 'cycle_statement' } },
      }),
    ).toEqual({
      storeId,
      providerMessageId: 'em_1',
      status: 'BOUNCED',
      at: new Date('2026-11-01T12:00:00Z'),
    });
  });

  it('ignora otros eventos y los correos sin etiqueta de tienda (D14)', () => {
    expect(emailEventOf({ type: 'email.opened', data: { email_id: 'em_1' } })).toBeNull();
    expect(emailEventOf({ type: 'email.delivered', data: { email_id: 'em_1' } })).toBeNull();
    expect(
      emailEventOf({
        type: 'email.delivered',
        data: { email_id: 'em_1', tags: { store_id: 'x' } },
      }),
    ).toBeNull();
  });
});
