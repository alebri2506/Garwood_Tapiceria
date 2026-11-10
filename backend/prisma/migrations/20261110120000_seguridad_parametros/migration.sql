-- Seguridad y parámetros (CU-S01, S03, S04, S05, S06 · decisiones-recientes.md, sección D).

-- ─── usuario ───────────────────────────────────────────────────────────────────────────────────────
-- nombre: nombre visible del personal (A20). email: opcional para Producción y Conductor (D.1.2; la regla
-- por rol se valida en el backend). debe_cambiar_contrasena: contraseña temporal (D.1.3).
-- version_sesion: corta la renovación de sesiones viejas al desactivar o cambiar rol/contraseña (D.1.6).

-- Dispositivo pasa a ser una lista fija (D.1.7). Hasta ahora nadie lo llenaba; si hubiera otro valor, se vacía
-- (es solo informativo) para que entre el CHECK.
UPDATE "usuario" SET "dispositivo" = NULL WHERE "dispositivo" NOT IN ('Computadora', 'Celular', 'Tablet');

ALTER TABLE "usuario" ADD COLUMN     "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nombre" VARCHAR(80),
ADD COLUMN     "version_sesion" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "dispositivo" SET DATA TYPE VARCHAR(20);

ALTER TABLE "usuario" ADD CONSTRAINT "usuario_dispositivo_check"
  CHECK ("dispositivo" IS NULL OR "dispositivo" IN ('Computadora', 'Celular', 'Tablet'));

-- ─── parametro ─────────────────────────────────────────────────────────────────────────────────────
-- Datos para mostrar y validar cada parámetro en A14 (D.3). Los límites quedan en minimo/maximo (D.3.4).
ALTER TABLE "parametro" ADD COLUMN     "ayuda" VARCHAR(300),
ADD COLUMN     "etiqueta" VARCHAR(120),
ADD COLUMN     "grupo" VARCHAR(40),
ADD COLUMN     "maximo" DECIMAL(12,2),
ADD COLUMN     "minimo" DECIMAL(12,2),
ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" VARCHAR(20) NOT NULL DEFAULT 'texto';

ALTER TABLE "parametro" ADD CONSTRAINT "parametro_tipo_check"
  CHECK ("tipo" IN ('entero', 'decimal', 'porcentaje', 'monto', 'horario', 'texto'));
ALTER TABLE "parametro" ADD CONSTRAINT "parametro_rango_check"
  CHECK ("minimo" IS NULL OR "maximo" IS NULL OR "minimo" <= "maximo");

-- modificado_por pasa a ser una relación real con usuario. Hasta ahora nadie lo llenaba; por si acaso,
-- se vacían los valores que no apunten a un usuario existente.
UPDATE "parametro" SET "modificado_por" = NULL
  WHERE "modificado_por" IS NOT NULL AND "modificado_por" NOT IN (SELECT "id" FROM "usuario");
ALTER TABLE "parametro" ADD CONSTRAINT "parametro_modificado_por_fkey" FOREIGN KEY ("modificado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── parametro_historial (CU-S05) ──────────────────────────────────────────────────────────────────
CREATE TABLE "parametro_historial" (
    "id" SERIAL NOT NULL,
    "parametro_id" INTEGER NOT NULL,
    "valor_anterior" VARCHAR(200) NOT NULL,
    "valor_nuevo" VARCHAR(200) NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametro_historial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parametro_historial_parametro_id_fecha_idx" ON "parametro_historial"("parametro_id", "fecha");
CREATE INDEX "parametro_historial_fecha_idx" ON "parametro_historial"("fecha");

ALTER TABLE "parametro_historial" ADD CONSTRAINT "parametro_historial_parametro_id_fkey" FOREIGN KEY ("parametro_id") REFERENCES "parametro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parametro_historial" ADD CONSTRAINT "parametro_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Igual que las demás tablas: cerrada a la API REST pública de Supabase (ver 20261103010000_seguridad_rls).
ALTER TABLE "parametro_historial" ENABLE ROW LEVEL SECURITY;

-- ─── bitacora (CU-S06) ─────────────────────────────────────────────────────────────────────────────
-- Filtro por usuario en A20 › Registro de actividad y "último acceso" (D.1.8).
CREATE INDEX "bitacora_usuario_id_fecha_idx" ON "bitacora"("usuario_id", "fecha");

-- "El registro no se puede editar ni borrar" (A20, D.2.3): la base rechaza UPDATE, DELETE y TRUNCATE,
-- venga de la app o de una consola. Como efecto, tampoco se puede borrar físicamente un usuario con
-- actividad (RG-03: se desactiva).
CREATE FUNCTION "bitacora_solo_lectura"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora no se puede modificar ni borrar (RG-02).'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "bitacora_sin_cambios"
  BEFORE UPDATE OR DELETE ON "bitacora"
  FOR EACH ROW EXECUTE FUNCTION "bitacora_solo_lectura"();

CREATE TRIGGER "bitacora_sin_vaciar"
  BEFORE TRUNCATE ON "bitacora"
  FOR EACH STATEMENT EXECUTE FUNCTION "bitacora_solo_lectura"();
