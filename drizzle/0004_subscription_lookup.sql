-- Suscripciones SaaS (US23, Plan 7). Cuando un cobro recurrente de Mercado Pago
-- llega solo con `mp_preapproval_id`, esta función encuentra el `store_id` sin
-- abrir la RLS de `store_subscriptions`. Todo el asentamiento posterior corre
-- dentro de `withTenant(store_id, ...)`. Es idempotente.

CREATE OR REPLACE FUNCTION subscription_store_by_preapproval(p_preapproval_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT ss.store_id
    FROM store_subscriptions ss
    JOIN stores s ON s.id = ss.store_id
    WHERE ss.mp_preapproval_id = btrim(p_preapproval_id)
      AND s.is_active
    LIMIT 1;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION subscription_store_by_preapproval(TEXT) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION subscription_store_by_preapproval(TEXT) TO quina_app;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION subscription_store_by_preapproval(TEXT) FROM anon, authenticated;
    END IF;
END $$;
