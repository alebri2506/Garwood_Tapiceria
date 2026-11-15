-- A16 Plantillas de cotización (CU-C06): máquinas con su tarifa por hora, plantillas versionadas por tipo de mueble + servicio,
-- sus actividades y materiales.
-- CreateTable
CREATE TABLE "maquina" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "tarifa_hora" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maquina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla" (
    "id" SERIAL NOT NULL,
    "tipo_mueble_id" INTEGER NOT NULL,
    "servicio" VARCHAR(20) NOT NULL,
    "version" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_por" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_actividad" (
    "id" SERIAL NOT NULL,
    "plantilla_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "horas_persona" DECIMAL(6,2) NOT NULL,
    "maquina_id" INTEGER,
    "horas_maquina" DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT "plantilla_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_material" (
    "id" SERIAL NOT NULL,
    "actividad_id" INTEGER NOT NULL,
    "material_id" INTEGER,
    "cantidad" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "plantilla_material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maquina_nombre_key" ON "maquina"("nombre");

-- CreateIndex
CREATE INDEX "plantilla_activa_idx" ON "plantilla"("activa");

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_tipo_mueble_id_servicio_version_key" ON "plantilla"("tipo_mueble_id", "servicio", "version");

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_actividad_plantilla_id_orden_key" ON "plantilla_actividad"("plantilla_id", "orden");

-- CreateIndex
CREATE INDEX "plantilla_material_actividad_id_idx" ON "plantilla_material"("actividad_id");

-- AddForeignKey
ALTER TABLE "plantilla" ADD CONSTRAINT "plantilla_tipo_mueble_id_fkey" FOREIGN KEY ("tipo_mueble_id") REFERENCES "tipo_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla" ADD CONSTRAINT "plantilla_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_actividad" ADD CONSTRAINT "plantilla_actividad_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_actividad" ADD CONSTRAINT "plantilla_actividad_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_material" ADD CONSTRAINT "plantilla_material_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "plantilla_actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_material" ADD CONSTRAINT "plantilla_material_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reglas en la base (convención de la tesis: opciones como varchar con CHECK).
ALTER TABLE "maquina" ADD CONSTRAINT "maquina_tarifa_check" CHECK ("tarifa_hora" >= 0);
ALTER TABLE "plantilla" ADD CONSTRAINT "plantilla_servicio_check" CHECK ("servicio" IN ('retapizado', 'retapizado_espuma', 'espuma', 'estructura', 'fabricacion'));
ALTER TABLE "plantilla" ADD CONSTRAINT "plantilla_version_check" CHECK ("version" >= 1);
ALTER TABLE "plantilla_actividad" ADD CONSTRAINT "plantilla_actividad_horas_check" CHECK ("horas_persona" >= 0 AND "horas_maquina" >= 0);
ALTER TABLE "plantilla_material" ADD CONSTRAINT "plantilla_material_cantidad_check" CHECK ("cantidad" > 0);

-- Una sola versión activa por tipo de mueble + servicio (dos administradores no pueden dejar dos activas a la vez).
CREATE UNIQUE INDEX "plantilla_una_activa" ON "plantilla" ("tipo_mueble_id", "servicio") WHERE "activa";

-- Igual que en las demás tablas: RLS sin políticas para que la API REST de Supabase no las exponga.
ALTER TABLE "maquina" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plantilla" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plantilla_actividad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plantilla_material" ENABLE ROW LEVEL SECURITY;
