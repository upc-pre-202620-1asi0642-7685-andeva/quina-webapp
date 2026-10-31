// Aceptación de los Términos y condiciones y de la Política de privacidad al crear
// la cuenta (Ley N.° 29733; docs/project-statement.md, punto 3). La casilla de
// /register guarda la versión aceptada en esta cookie y auth.ts la exige al crear
// el usuario, por correo o por Google, antes de dejar constancia en audit_logs.

/** Fecha de la versión vigente de ambos documentos. Cambiarla pide aceptarlos de nuevo. */
export const LEGAL_TERMS_VERSION = '2026-10-31';

export const CONSENT_COOKIE = 'quina-consent';

/**
 * Documentos legales. Aún no existen: los enlaces quedan vacíos hasta publicarlos
 * en el sitio (quina.andeva.tech/legal/terminos y /legal/privacidad).
 */
export const LEGAL_URLS = {
  terms: '#',
  privacy: '#',
} as const;

/** Cookie de corta vida: solo tiene que sobrevivir el ida y vuelta a Google. */
export function consentCookie(): string {
  return `${CONSENT_COOKIE}=${LEGAL_TERMS_VERSION}; Path=/; Max-Age=900; SameSite=Lax`;
}

export function clearConsentCookie(): string {
  return `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
