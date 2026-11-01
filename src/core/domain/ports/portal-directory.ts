import type { DocumentId } from '../identity/document-id';
import type { Locale } from '../shared/locale';

/** Una tienda donde el correo del vecino está registrado (Plan 5, P1). */
export type PortalLink = { storeId: string; customerId: string; locale: Locale };

/** Búsquedas del portal que cruzan tiendas sin abrir la RLS (funciones SECURITY DEFINER). */
export interface PortalDirectory {
  linksForEmail(email: string): Promise<PortalLink[]>;
  emailsForDocument(document: DocumentId): Promise<string[]>;
}

/** Códigos de 6 dígitos para entrar al portal con el documento (US14.4). */
export interface PortalCodes {
  /** Último envío de un código vigente a ese correo, o null. */
  lastSentAt(email: string): Promise<Date | null>;
  send(email: string): Promise<void>;
  /** El correo cuyo código vigente es `code`, sin gastar intentos (D6). */
  emailForCode(emails: readonly string[], code: string): Promise<string | null>;
  /** Un código errado cuenta como intento en todos los candidatos. */
  recordFailure(emails: readonly string[]): Promise<void>;
}
