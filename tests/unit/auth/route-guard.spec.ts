import { describe, expect, it } from 'vitest';
import { nextRouteFor, type SessionUser } from '@/presentation/auth/session';

const baseUser: SessionUser = {
  id: 'u-1',
  name: 'Rosa Quispe',
  email: 'rosa@bodega.pe',
  emailVerified: true,
  role: 'STORE_OWNER',
  storeId: 's-1',
  preferredLocale: 'es',
};

describe('nextRouteFor (guardia de rutas)', () => {
  it('sin sesión manda a /login salvo en rutas públicas de autenticación', () => {
    expect(nextRouteFor(null, '/')).toBe('/login');
    expect(nextRouteFor(null, '/app')).toBe('/login');
    expect(nextRouteFor(null, '/profile')).toBe('/login');
    expect(nextRouteFor(null, '/register/store')).toBe('/login');

    expect(nextRouteFor(null, '/login')).toBeNull();
    expect(nextRouteFor(null, '/register')).toBeNull();
    expect(nextRouteFor(null, '/register/verify?email=rosa@bodega.pe')).toBeNull();
    expect(nextRouteFor(null, '/auth/forgot-password')).toBeNull();
    expect(nextRouteFor(null, '/auth/reset-password?token=abc')).toBeNull();
  });

  it('usuario sin verificar correo siempre va a /register/verify', () => {
    const unverified: SessionUser = {
      ...baseUser,
      emailVerified: false,
      role: 'PENDING_OWNER',
      storeId: null,
    };
    expect(nextRouteFor(unverified, '/')).toBe('/register/verify');
    expect(nextRouteFor(unverified, '/profile')).toBe('/register/verify');
    expect(nextRouteFor(unverified, '/register/store')).toBe('/register/verify');
    expect(nextRouteFor(unverified, '/login')).toBe('/register/verify');
    expect(nextRouteFor(unverified, '/register/verify')).toBeNull();
  });

  it('usuario PENDING_OWNER verificado siempre va a /register/store', () => {
    const pending: SessionUser = { ...baseUser, role: 'PENDING_OWNER', storeId: null };
    expect(nextRouteFor(pending, '/')).toBe('/register/store');
    expect(nextRouteFor(pending, '/profile')).toBe('/register/store');
    expect(nextRouteFor(pending, '/login')).toBe('/register/store');
    expect(nextRouteFor(pending, '/register')).toBe('/register/store');
    expect(nextRouteFor(pending, '/register/verify')).toBe('/register/store');
    expect(nextRouteFor(pending, '/register/store')).toBeNull();
  });

  it('STORE_OWNER entra al panel y sale de rutas de autenticación hacia /', () => {
    expect(nextRouteFor(baseUser, '/')).toBeNull();
    expect(nextRouteFor(baseUser, '/profile')).toBeNull();
    expect(nextRouteFor(baseUser, '/login')).toBe('/');
    expect(nextRouteFor(baseUser, '/register')).toBe('/');
    expect(nextRouteFor(baseUser, '/register/verify')).toBe('/');
    expect(nextRouteFor(baseUser, '/register/store')).toBe('/');
    expect(nextRouteFor(baseUser, '/auth/forgot-password')).toBe('/');
    expect(nextRouteFor(baseUser, '/auth/reset-password')).toBe('/');
  });
});
