-- Solo para el PostgreSQL local de compose.yaml (corre una vez, como superusuario).
-- migrator replica los límites de `postgres` en Supabase: no es superusuario,
-- pero puede crear roles y saltar RLS. Las migraciones corren con este rol.
CREATE ROLE migrator LOGIN PASSWORD 'migrator' NOSUPERUSER CREATEROLE BYPASSRLS;

CREATE DATABASE quina_dev OWNER migrator;
CREATE DATABASE quina_test OWNER migrator;

\connect quina_dev
ALTER SCHEMA public OWNER TO migrator;

\connect quina_test
ALTER SCHEMA public OWNER TO migrator;
