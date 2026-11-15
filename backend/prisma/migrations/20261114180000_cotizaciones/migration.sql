-- AlterTable
ALTER TABLE "tipo_mueble" ADD COLUMN     "tamano_carga" VARCHAR(10) NOT NULL DEFAULT 'mediana';

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "estado" VARCHAR(40) NOT NULL,
    "millas" DECIMAL(8,2),
    "transporte" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "transporte_manual" BOOLEAN NOT NULL DEFAULT false,
    "motivo_transporte" VARCHAR(160),
    "adelanto_pct_sugerido" DECIMAL(5,2) NOT NULL,
    "adelanto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "adelanto_modificado" BOOLEAN NOT NULL DEFAULT false,
    "observaciones" VARCHAR(1000),
    "borrador" JSONB,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vigencia_hasta" DATE,
    "creado_por" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_modificacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_por" INTEGER,
    "fecha_publicacion" TIMESTAMPTZ,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_mueble" (
    "id" SERIAL NOT NULL,
    "cotizacion_id" INTEGER NOT NULL,
    "solicitud_mueble_id" INTEGER NOT NULL,
    "plantilla_id" INTEGER,
    "materiales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "mano_obra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maquinaria" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costos_fijos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "precio_sugerido" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "precio_propuesto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "motivo_precio" VARCHAR(160),
    "revisado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cotizacion_mueble_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_actividad" (
    "id" SERIAL NOT NULL,
    "mueble_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "horas_persona" DECIMAL(6,2) NOT NULL,
    "maquina_id" INTEGER,
    "maquina" VARCHAR(60),
    "tarifa_maquina" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "horas_maquina" DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT "cotizacion_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_material" (
    "id" SERIAL NOT NULL,
    "actividad_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "cotizacion_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_tela" (
    "id" SERIAL NOT NULL,
    "mueble_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "yardas" DECIMAL(8,2) NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "cotizacion_tela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_codigo_key" ON "cotizacion"("codigo");

-- CreateIndex
CREATE INDEX "cotizacion_estado_idx" ON "cotizacion"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_solicitud_id_version_key" ON "cotizacion"("solicitud_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_mueble_cotizacion_id_solicitud_mueble_id_key" ON "cotizacion_mueble"("cotizacion_id", "solicitud_mueble_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_actividad_mueble_id_orden_key" ON "cotizacion_actividad"("mueble_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_tela_mueble_id_material_id_key" ON "cotizacion_tela"("mueble_id", "material_id");

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_publicado_por_fkey" FOREIGN KEY ("publicado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_mueble" ADD CONSTRAINT "cotizacion_mueble_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_mueble" ADD CONSTRAINT "cotizacion_mueble_solicitud_mueble_id_fkey" FOREIGN KEY ("solicitud_mueble_id") REFERENCES "solicitud_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_mueble" ADD CONSTRAINT "cotizacion_mueble_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_actividad" ADD CONSTRAINT "cotizacion_actividad_mueble_id_fkey" FOREIGN KEY ("mueble_id") REFERENCES "cotizacion_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_actividad" ADD CONSTRAINT "cotizacion_actividad_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_material" ADD CONSTRAINT "cotizacion_material_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "cotizacion_actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_material" ADD CONSTRAINT "cotizacion_material_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_tela" ADD CONSTRAINT "cotizacion_tela_mueble_id_fkey" FOREIGN KEY ("mueble_id") REFERENCES "cotizacion_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_tela" ADD CONSTRAINT "cotizacion_tela_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que Prisma no expresa.
ALTER TABLE "tipo_mueble" ADD CONSTRAINT "tipo_mueble_tamano_carga_check" CHECK ("tamano_carga" IN ('chica', 'mediana', 'grande'));
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_montos_check" CHECK ("transporte" >= 0 AND "adelanto" >= 0 AND "total" >= 0 AND ("millas" IS NULL OR "millas" >= 0));
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_adelanto_pct_check" CHECK ("adelanto_pct_sugerido" BETWEEN 0 AND 100);
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_version_check" CHECK ("version" >= 1);
ALTER TABLE "cotizacion_mueble" ADD CONSTRAINT "cotizacion_mueble_montos_check" CHECK ("materiales" >= 0 AND "mano_obra" >= 0 AND "maquinaria" >= 0 AND "costos_fijos" >= 0 AND "precio_sugerido" >= 0 AND "precio_propuesto" >= 0);
ALTER TABLE "cotizacion_actividad" ADD CONSTRAINT "cotizacion_actividad_horas_check" CHECK ("horas_persona" >= 0 AND "horas_maquina" >= 0 AND "tarifa_maquina" >= 0);
ALTER TABLE "cotizacion_material" ADD CONSTRAINT "cotizacion_material_check" CHECK ("cantidad" > 0 AND "precio" >= 0);
ALTER TABLE "cotizacion_tela" ADD CONSTRAINT "cotizacion_tela_check" CHECK ("yardas" >= 0 AND "precio" >= 0);

-- Tamaño de carga de los tipos de mueble que ya existen (según los ejemplos de las tarifas de transporte en Parámetros).
UPDATE "tipo_mueble" SET "tamano_carga" = 'grande' WHERE "codigo" IN ('s2', 's3', 'sL', 'sc', 'bed');
UPDATE "tipo_mueble" SET "tamano_carga" = 'chica' WHERE "codigo" IN ('ch', 'ot', 'wn');

-- Supabase: sin acceso directo desde el cliente (la API usa el rol del servidor).
ALTER TABLE "cotizacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cotizacion_mueble" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cotizacion_actividad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cotizacion_material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cotizacion_tela" ENABLE ROW LEVEL SECURITY;
