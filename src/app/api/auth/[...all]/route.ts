import { toNextJsHandler } from 'better-auth/next-js';
import { AUTH_BASE_PATH, getAuth } from '@/infrastructure/auth/auth';

// Esta ruta es /api/auth/* dentro de la app; con el basePath '/app' de Next queda
// en /app/api/auth/*. Next entrega request.url sin su basePath (/api/auth/...) y
// request.nextUrl.basePath llega vacío en los route handlers, pero Better Auth
// enruta y arma sus enlaces con /app/api/auth: se le devuelve el prefijo.
const ROUTE_PATH = '/api/auth';

function withBasePath(request: Request): Request {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${ROUTE_PATH}/`)) return request;
  url.pathname = AUTH_BASE_PATH + url.pathname.slice(ROUTE_PATH.length);
  return new Request(url, request);
}

// El enlace mágico solo lo crea el servidor (createPortalLink, Plan 5 D5): por HTTP no existe.
const SERVER_ONLY = new Set([`${ROUTE_PATH}/sign-in/magic-link`]);

// La instancia se resuelve en cada petición: así el build no exige las variables.
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(async (request: Request) =>
  SERVER_ONLY.has(new URL(request.url).pathname)
    ? new Response(null, { status: 404 })
    : getAuth().handler(withBasePath(request)),
);
