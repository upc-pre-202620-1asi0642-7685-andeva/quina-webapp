/**
 * Rol de una cuenta nueva (Plan 5, D7). Quien se registra en /register (o trae la
 * cookie de consentimiento del comerciante) va a crear su tienda; quien no, entra
 * como vecino solo si alguna tienda lo registró con ese correo.
 */
export type NewUserRole = 'PENDING_OWNER' | 'CUSTOMER' | 'CONSENT_REQUIRED';

export function decideNewUserRole(input: {
  /** Ruta de Better Auth que crea el usuario (`/sign-up/email`, `/callback/google`…). */
  path: string | undefined;
  /** Aceptó los términos del comerciante (o es una llamada interna sin navegador). */
  consented: boolean;
  /** El correo es de un vecino activo en alguna tienda activa. */
  isCustomer: boolean;
}): NewUserRole {
  if (input.path === '/sign-up/email')
    return input.consented ? 'PENDING_OWNER' : 'CONSENT_REQUIRED';
  if (input.isCustomer && !input.consented) return 'CUSTOMER';
  if (input.consented) return 'PENDING_OWNER';
  return 'CONSENT_REQUIRED';
}
