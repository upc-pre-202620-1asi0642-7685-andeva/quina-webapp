import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC_PATHS = new Set([
  '/auth/accept-invite',
  '/login',
  '/register',
  '/register/verify',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/portal/login',
  '/portal/enter',
  // US22: la precarga el service worker, sin sesión
  '/offline',
]);

// Chequeo optimista en el borde: excluye api, _next, brand y archivos estáticos.
// La validación completa contra base de datos (rol, verificación, bloqueo) corre
// en los Server Components con getSessionUser() y nextRouteFor().
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/brand') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (PUBLIC_PATHS.has(normalized) || normalized.startsWith('/privacy/')) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = request.nextUrl.clone();
    // El vecino sin sesión va a su propio ingreso (Plan 5)
    const portal = normalized === '/portal' || normalized.startsWith('/portal/');
    loginUrl.pathname = portal ? '/portal/login' : '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  // Evita que el botón "Atrás" del navegador muestre el panel tras cerrar sesión
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  return response;
}
