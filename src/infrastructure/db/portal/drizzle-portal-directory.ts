import { sql } from 'drizzle-orm';
import type { DocumentId } from '@/core/domain/identity/document-id';
import type { PortalDirectory, PortalLink } from '@/core/domain/ports/portal-directory';
import { locales, type Locale } from '@/core/domain/shared/locale';
import { db as defaultDb, type Database } from '../connection';

/** Llama a las funciones SECURITY DEFINER de la migración 0003 (Plan 5, P1). */
export function createPortalDirectory(database: Database = defaultDb): PortalDirectory {
  return {
    async linksForEmail(email: string): Promise<PortalLink[]> {
      const rows = await database.execute<{
        store_id: string;
        customer_id: string;
        preferred_locale: string;
      }>(sql`SELECT * FROM portal_customer_links(${email})`);
      return rows.map((r) => ({
        storeId: r.store_id,
        customerId: r.customer_id,
        locale: locales.includes(r.preferred_locale as Locale)
          ? (r.preferred_locale as Locale)
          : 'es',
      }));
    },
    async emailsForDocument(document: DocumentId): Promise<string[]> {
      const rows = await database.execute<{ email: string }>(
        sql`SELECT email FROM portal_emails_for_document(${document.type}, ${document.number})`,
      );
      return rows.map((r) => r.email);
    },
  };
}
