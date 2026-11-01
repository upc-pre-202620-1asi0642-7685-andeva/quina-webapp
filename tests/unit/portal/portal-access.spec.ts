import { describe, expect, it } from 'vitest';
import {
  RequestPortalCodeUseCase,
  VerifyPortalCodeUseCase,
} from '@/core/application/portal/portal-code';
import { decideNewUserRole } from '@/core/domain/identity/new-user-role';
import type { PortalCodes, PortalDirectory } from '@/core/domain/ports/portal-directory';
import { nextRouteFor, type SessionUser } from '@/presentation/auth/session';
import { portalEnterUrl } from '@/infrastructure/auth/portal-link';
import { renderCollectionsEmail } from '@/infrastructure/email/collections-templates';
import type { CollectionsMail } from '@/core/domain/ports/collections-mailer';

const dni = { type: 'DNI', number: '12345678' } as const;

function setup(emails: string[], codes: Record<string, { code: string; sentAt: Date }> = {}) {
  const sent: string[] = [];
  const failures: string[][] = [];
  const directory: PortalDirectory = {
    linksForEmail: async () => [],
    emailsForDocument: async () => emails,
  };
  const portalCodes: PortalCodes = {
    lastSentAt: async (email) => codes[email]?.sentAt ?? null,
    send: async (email) => void sent.push(email),
    emailForCode: async (candidates, code) =>
      candidates.find((email) => codes[email]?.code === code) ?? null,
    recordFailure: async (candidates) => void failures.push([...candidates]),
  };
  return {
    sent,
    failures,
    request: new RequestPortalCodeUseCase(directory, portalCodes),
    verify: new VerifyPortalCodeUseCase(directory, portalCodes),
  };
}

describe('decideNewUserRole (Plan 5, D7)', () => {
  it('el registro del comerciante sigue igual', () => {
    expect(decideNewUserRole({ path: '/sign-up/email', consented: true, isCustomer: true })).toBe(
      'PENDING_OWNER',
    );
    expect(decideNewUserRole({ path: '/sign-up/email', consented: false, isCustomer: false })).toBe(
      'CONSENT_REQUIRED',
    );
  });

  it('un correo registrado por una tienda entra como vecino (US14.3)', () => {
    expect(decideNewUserRole({ path: '/callback/:id', consented: false, isCustomer: true })).toBe(
      'CUSTOMER',
    );
    expect(
      decideNewUserRole({ path: '/sign-in/email-otp', consented: false, isCustomer: true }),
    ).toBe('CUSTOMER');
  });

  it('un correo ajeno sin la casilla del comerciante se rechaza', () => {
    expect(decideNewUserRole({ path: '/callback/:id', consented: false, isCustomer: false })).toBe(
      'CONSENT_REQUIRED',
    );
  });

  it('con la casilla aceptada, Google crea al dueño aunque también sea vecino', () => {
    expect(decideNewUserRole({ path: '/callback/:id', consented: true, isCustomer: true })).toBe(
      'PENDING_OWNER',
    );
  });
});

describe('RequestPortalCodeUseCase (US14.4)', () => {
  it('manda un código a cada correo distinto del documento', async () => {
    const { request, sent } = setup(['rosa@a.pe', 'rosa@b.pe']);
    await request.execute({ document: dni, now: new Date() });
    expect(sent).toEqual(['rosa@a.pe', 'rosa@b.pe']);
  });

  it('no manda nada si el documento no existe, sin fallar (respuesta fija)', async () => {
    const { request, sent } = setup([]);
    await expect(request.execute({ document: dni, now: new Date() })).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('respeta 60 s entre códigos al mismo correo (D4)', async () => {
    const now = new Date('2026-11-01T15:00:00Z');
    const { request, sent } = setup(['rosa@a.pe', 'rosa@b.pe'], {
      'rosa@a.pe': { code: '111111', sentAt: new Date(now.getTime() - 30_000) },
      'rosa@b.pe': { code: '222222', sentAt: new Date(now.getTime() - 61_000) },
    });
    await request.execute({ document: dni, now });
    expect(sent).toEqual(['rosa@b.pe']);
  });
});

describe('VerifyPortalCodeUseCase (US14.4, D6)', () => {
  const codes = {
    'rosa@a.pe': { code: '111111', sentAt: new Date() },
    'rosa@b.pe': { code: '222222', sentAt: new Date() },
  };

  it('devuelve el correo al que se mandó ese código', async () => {
    const { verify, failures } = setup(['rosa@a.pe', 'rosa@b.pe'], codes);
    expect(await verify.execute({ document: dni, code: '222222' })).toEqual({
      ok: true,
      value: { email: 'rosa@b.pe' },
    });
    expect(failures).toEqual([]);
  });

  it('un código errado cuenta un intento en todos los candidatos', async () => {
    const { verify, failures } = setup(['rosa@a.pe', 'rosa@b.pe'], codes);
    expect(await verify.execute({ document: dni, code: '999999' })).toEqual({
      ok: false,
      error: 'CODE_INVALID',
    });
    expect(failures).toEqual([['rosa@a.pe', 'rosa@b.pe']]);
  });

  it('rechaza lo que no son 6 números sin tocar los intentos', async () => {
    const { verify, failures } = setup(['rosa@a.pe'], codes);
    expect((await verify.execute({ document: dni, code: '12ab' })).ok).toBe(false);
    expect(failures).toEqual([]);
  });
});

describe('nextRouteFor en el portal (D8)', () => {
  const owner: SessionUser = {
    id: 'u-1',
    name: 'Lucho',
    email: 'lucho@bodega.pe',
    emailVerified: true,
    role: 'STORE_OWNER',
    storeId: 's-1',
    preferredLocale: 'es',
  };
  const customer: SessionUser = { ...owner, role: 'CUSTOMER', storeId: null };

  it('sin sesión el portal manda a su propio ingreso', () => {
    expect(nextRouteFor(null, '/portal')).toBe('/portal/login');
    expect(nextRouteFor(null, '/app/portal/s-1')).toBe('/portal/login');
    expect(nextRouteFor(null, '/portal/login')).toBeNull();
    expect(nextRouteFor(null, '/portal/enter?token=x')).toBeNull();
  });

  it('el vecino solo usa el portal', () => {
    expect(nextRouteFor(customer, '/')).toBe('/portal');
    expect(nextRouteFor(customer, '/customers')).toBe('/portal');
    expect(nextRouteFor(customer, '/login')).toBe('/portal');
    expect(nextRouteFor(customer, '/portal/s-1')).toBeNull();
    expect(nextRouteFor(customer, '/portal/login')).toBe('/portal');
  });

  it('un dueño, un dueño pendiente o el Administrador también abren el portal (P2)', () => {
    expect(nextRouteFor(owner, '/portal')).toBeNull();
    expect(nextRouteFor({ ...owner, role: 'PENDING_OWNER', storeId: null }, '/portal')).toBeNull();
    expect(nextRouteFor({ ...owner, role: 'PLATFORM_ADMIN', storeId: null }, '/portal')).toBeNull();
    expect(nextRouteFor(owner, '/portal/enter')).toBeNull();
  });
});

describe('enlace mágico en los correos (US14.2)', () => {
  it('apunta a /portal/enter con el token y la tienda, no al endpoint de verificación (D5)', () => {
    const url = new URL(portalEnterUrl('https://quina.andeva.tech/app/', 'abc', 'store-1'));
    expect(url.pathname).toBe('/app/portal/enter');
    expect(url.searchParams.get('token')).toBe('abc');
    expect(url.searchParams.get('to')).toBe('/portal/store-1');
  });

  const mail: CollectionsMail = {
    kind: 'payment-reminder',
    to: 'rosa@example.com',
    locale: 'es',
    storeId: 'store-1',
    storeName: 'Bodega Rosa',
    storeContact: null,
    storeYape: null,
    customerName: 'Rosa',
    currency: 'PEN',
    lines: [],
    total: '25.00',
    paymentDueDate: '2026-10-05',
  };

  it('el recordatorio lleva el botón al portal y sin enlace no lo lleva', () => {
    const withLink = renderCollectionsEmail({
      ...mail,
      portalUrl: 'https://x.test/app/portal/enter?token=t',
    });
    expect(withLink.html).toContain('href="https://x.test/app/portal/enter?token=t"');
    expect(withLink.text).toContain('https://x.test/app/portal/enter?token=t');
    expect(renderCollectionsEmail(mail).html).not.toContain('portal/enter');
  });
});
