-- Portal del vecino (US14, Plan 5, decisión P1). El portal no conoce la tienda:
-- con estas dos funciones encuentra, sin abrir la RLS, en qué tiendas está un
-- correo o un documento. Solo devuelven ids, el idioma y correos; todo lo demás
-- se lee después con withTenant. Corren con el dueño de la migración (migrator
-- en local, postgres en Supabase), que tiene BYPASSRLS; sin él no ven ninguna fila.
-- Es idempotente.

-- Tiendas donde un correo verificado es vecino activo (acceso al portal, D1 y D2).
CREATE OR REPLACE FUNCTION portal_customer_links(p_email TEXT)
RETURNS TABLE (store_id UUID, customer_id UUID, preferred_locale VARCHAR(2))
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT c.store_id, c.id, COALESCE(c.preferred_locale, s.default_locale)
    FROM customers c
    JOIN stores s ON s.id = c.store_id
    WHERE lower(c.email) = lower(btrim(p_email))
      AND c.is_active
      AND s.is_active
    ORDER BY s.commercial_name, c.store_id;
$$;
--> statement-breakpoint

-- Correos distintos registrados con un documento (ingreso por DNI, CE o pasaporte, US14.4).
CREATE OR REPLACE FUNCTION portal_emails_for_document(p_type TEXT, p_number TEXT)
RETURNS TABLE (email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT DISTINCT lower(c.email)
    FROM customers c
    JOIN stores s ON s.id = c.store_id
    WHERE c.document_type = p_type
      AND c.document_number = upper(btrim(p_number))
      AND c.is_active
      AND s.is_active;
$$;
--> statement-breakpoint

-- Por defecto PostgreSQL deja ejecutar funciones a PUBLIC: solo la app puede.
REVOKE ALL ON FUNCTION portal_customer_links(TEXT) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION portal_emails_for_document(TEXT, TEXT) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_customer_links(TEXT) TO quina_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_emails_for_document(TEXT, TEXT) TO quina_app;
--> statement-breakpoint
DO $$
BEGIN
    -- Supabase: anon y authenticated no deben llamarlas por la Data API (cerrada igual)
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION portal_customer_links(TEXT) FROM anon, authenticated;
        REVOKE ALL ON FUNCTION portal_emails_for_document(TEXT, TEXT) FROM anon, authenticated;
    END IF;
END $$;
