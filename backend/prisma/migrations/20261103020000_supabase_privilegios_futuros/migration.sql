-- Supabase concede por defecto todos los permisos a `anon` y `authenticated` sobre cada tabla NUEVA del
-- esquema public. Se quitan esos permisos por defecto para las tablas que creen las próximas migraciones
-- (pedido, cotizacion, ...), que así nacen cerradas a la API REST pública igual que las actuales.
-- Igual conviene activar RLS en cada tabla nueva: ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;
-- En un PostgreSQL normal (Docker) esos roles no existen y no se hace nada.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
