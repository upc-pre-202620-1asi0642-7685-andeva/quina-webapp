-- Seguridad: roles, permisos, inmutabilidad y RLS (docs/quina-database-schema.md, §4 y §5).
-- Es idempotente: se puede volver a ejecutar sobre una base ya migrada.
-- Drizzle la corre dentro de una transacción; no usa sentencias que no lo admitan.

-- ============================================================================
-- 1. ROLES (§5.1). Los roles son de todo el clúster y pueden existir de antes.
--    Nacen NOLOGIN y sin contraseña; `pnpm db:roles` activa LOGIN y la fija.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quina_app') THEN
        CREATE ROLE quina_app NOLOGIN NOBYPASSRLS;
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quina_platform') THEN
        BEGIN
            CREATE ROLE quina_platform NOLOGIN BYPASSRLS;
        EXCEPTION WHEN insufficient_privilege THEN
            CREATE ROLE quina_platform NOLOGIN NOBYPASSRLS;
            RAISE NOTICE 'quina_platform se creó NOBYPASSRLS: el rol que migra no tiene BYPASSRLS. El panel de plataforma necesitará políticas propias.';
        END;
    END IF;
END $$;
--> statement-breakpoint

-- ============================================================================
-- 2. PERMISOS (§5.1). Los privilegios por defecto van sin FOR ROLE: valen para
--    el rol que ejecuta las migraciones (postgres en Supabase, migrator en local).
-- ============================================================================
GRANT USAGE ON SCHEMA public TO quina_app, quina_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO quina_app, quina_platform;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO quina_app, quina_platform;
--> statement-breakpoint
-- Tablas de plataforma: la aplicación solo las lee
REVOKE INSERT, UPDATE, DELETE ON credit_rate_caps, rus_categories FROM quina_app;
--> statement-breakpoint

-- ============================================================================
-- 3. CIERRE DE LA DATA API DE SUPABASE (§5.2). anon y authenticated solo
--    existen en Supabase; en el PostgreSQL local y de CI el bloque no hace nada.
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
        REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    END IF;
END $$;
--> statement-breakpoint

-- ============================================================================
-- 4. INMUTABILIDAD CONTABLE Y DE AUDITORÍA (§4, bloque 9). Solo INSERT.
-- ============================================================================
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es de solo inserción: registra un ajuste en lugar de modificarla', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_audit_logs BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_inventory_movements BEFORE UPDATE OR DELETE ON inventory_movements
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_product_price_history BEFORE UPDATE OR DELETE ON product_price_history
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_customer_consents BEFORE UPDATE OR DELETE ON customer_consents
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_sales BEFORE UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_sale_items BEFORE UPDATE OR DELETE ON sale_items
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_debt_payments BEFORE UPDATE OR DELETE ON debt_payments
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_payment_allocations BEFORE UPDATE OR DELETE ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_subscription_payments BEFORE UPDATE OR DELETE ON subscription_payments
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_immutable_credit_charge_voids BEFORE UPDATE OR DELETE ON credit_charge_voids
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint

-- ============================================================================
-- 5. AISLAMIENTO POR TIENDA (§5.3 y §5.4). Sin contexto, app_current_store_id()
--    es NULL y las políticas no devuelven filas: seguro por defecto.
-- ============================================================================
CREATE OR REPLACE FUNCTION app_current_store_id() RETURNS UUID
    LANGUAGE sql STABLE
    SET search_path = pg_catalog, public
AS $$
    SELECT NULLIF(current_setting('app.current_store_id', true), '')::UUID;
$$;
--> statement-breakpoint
DO $$
DECLARE
    tenant_table TEXT;
BEGIN
    FOREACH tenant_table IN ARRAY ARRAY[
        'store_subscriptions', 'subscription_payments',
        'customers', 'customer_consents', 'credit_accounts', 'credit_charges',
        'settlement_cycles', 'credit_installments', 'debt_payments', 'payment_allocations',
        'credit_charge_voids',
        'units', 'categories', 'products', 'product_price_history', 'suppliers',
        'purchases', 'purchase_items', 'purchase_attachments', 'purchase_orders',
        'purchase_order_items', 'inventory_movements',
        'sales', 'sale_items', 'ai_recommendation_quotas'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tenant_table);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL TO quina_app
                USING (store_id = app_current_store_id())
                WITH CHECK (store_id = app_current_store_id())',
            tenant_table
        );
    END LOOP;
END $$;
--> statement-breakpoint
-- Tablas con store_id opcional: la fila es visible para su tienda;
-- las filas de plataforma (store_id NULL) solo las ve quina_platform.
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON notification_logs;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_logs FOR ALL TO quina_app
    USING (store_id = app_current_store_id())
    WITH CHECK (store_id IS NULL OR store_id = app_current_store_id());
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs FOR ALL TO quina_app
    USING (store_id = app_current_store_id())
    WITH CHECK (store_id IS NULL OR store_id = app_current_store_id());
