import { headers } from 'next/headers';

export type RequestMeta = { ip: string; userAgent: string };

/** IP y navegador de quien hace la petición: evidencia de consentimientos y auditoría. */
export async function requestMeta(): Promise<RequestMeta> {
  const reqHeaders = await headers();
  const forwarded = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ip: (forwarded || reqHeaders.get('x-real-ip') || 'unknown').slice(0, 45),
    userAgent: reqHeaders.get('user-agent') ?? 'unknown',
  };
}

/** URL absoluta dentro de la webapp (`APP_URL` ya incluye `/app`). */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000/app').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
