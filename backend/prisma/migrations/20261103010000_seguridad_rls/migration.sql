-- Supabase publica el esquema `public` por su API REST (PostgREST) a los roles `anon` y `authenticated`.
-- GARWEB no usa esa API: todo pasa por el backend. Se activa RLS sin políticas para que esos roles no
-- puedan leer ni escribir nada (p. ej. usuario.contrasena_hash). El backend se conecta como dueño de las
-- tablas, así que RLS no lo afecta. En un PostgreSQL normal (Docker) estas sentencias son inofensivas.

ALTER TABLE "rol" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "token_recuperacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bitacora" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parametro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Además se quitan los permisos de esos roles, solo si existen (en Supabase sí; en Docker no).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END $$;
