/** Versión de la política de privacidad del vecino (US04 crit. 4). Cambia si cambia el texto. */
export const CUSTOMER_PRIVACY_VERSION = '2026-10-31';

export type ConsentType = 'DATA_PROTECTION_LAW_29733' | 'CREDIT_TERMS';

/**
 * Constancia inmutable en `customer_consents`. Se captura en el equipo de la
 * tienda: la IP y el navegador son los de ese equipo.
 */
export type ConsentRecord = {
  type: ConsentType;
  version: string;
  /** Texto exacto que se mostró al aceptar. */
  text: string;
  ip: string;
  userAgent: string;
};
