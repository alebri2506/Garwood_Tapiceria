-- CU-C02 descarte con motivo, muestra de tela, fotos pedidas por enlace; CU-C03/C04 citas y visitas; RG-05 notificaciones.

-- AlterTable
ALTER TABLE "solicitud" ADD COLUMN     "descartada_por" INTEGER,
ADD COLUMN     "espera_fotos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecha_descarte" TIMESTAMPTZ,
ADD COLUMN     "fecha_muestra_enviada" TIMESTAMPTZ,
ADD COLUMN     "motivo_descarte" VARCHAR(120),
ADD COLUMN     "muestra_estado" VARCHAR(12),
ADD COLUMN     "tela_confirmada_id" INTEGER;

-- CreateTable
CREATE TABLE "notificacion" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "solicitud_id" INTEGER,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "mensaje" VARCHAR(400) NOT NULL,
    "enlace" VARCHAR(200),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cita" (
    "id" SERIAL NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "tipo" VARCHAR(12) NOT NULL,
    "fecha_hora" TIMESTAMPTZ NOT NULL,
    "franja" VARCHAR(10),
    "duracion_min" INTEGER NOT NULL,
    "direccion_id" INTEGER,
    "reprogramaciones" INTEGER NOT NULL DEFAULT 0,
    "estado" VARCHAR(20) NOT NULL,
    "observaciones" VARCHAR(300),
    "registrado_por" INTEGER NOT NULL,
    "fecha_registro" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_bloqueo" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "hora_inicio" VARCHAR(5),
    "hora_fin" VARCHAR(5),
    "motivo" VARCHAR(120) NOT NULL,
    "creado_por" INTEGER,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_bloqueo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacion_usuario_id_leida_fecha_idx" ON "notificacion"("usuario_id", "leida", "fecha");

-- CreateIndex
CREATE INDEX "cita_fecha_hora_estado_idx" ON "cita"("fecha_hora", "estado");

-- CreateIndex
CREATE INDEX "cita_solicitud_id_idx" ON "cita"("solicitud_id");

-- CreateIndex
CREATE INDEX "agenda_bloqueo_fecha_idx" ON "agenda_bloqueo"("fecha");

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_descartada_por_fkey" FOREIGN KEY ("descartada_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_tela_confirmada_id_fkey" FOREIGN KEY ("tela_confirmada_id") REFERENCES "material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_direccion_id_fkey" FOREIGN KEY ("direccion_id") REFERENCES "direccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Las solicitudes con muestra ya registradas quedan como "pedida".
UPDATE "solicitud" SET "muestra_estado" = 'pedida' WHERE "muestra" = true AND "muestra_estado" IS NULL;

ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_muestra_estado_check"
  CHECK ("muestra_estado" IS NULL OR "muestra_estado" IN ('pedida', 'enviada', 'confirmada', 'otra'));
ALTER TABLE "cita" ADD CONSTRAINT "cita_tipo_check" CHECK ("tipo" IN ('local', 'domicilio'));
ALTER TABLE "cita" ADD CONSTRAINT "cita_estado_check" CHECK ("estado" IN ('Programada', 'Atendida', 'No asistió', 'Reprogramada', 'Cancelada'));
ALTER TABLE "cita" ADD CONSTRAINT "cita_franja_check" CHECK ("franja" IS NULL OR "franja" IN ('manana', 'tarde'));

-- Un cliente por turno (CU-C03): no puede haber dos citas programadas en el local a la misma hora.
CREATE UNIQUE INDEX "cita_turno_local_unico" ON "cita" ("fecha_hora") WHERE "tipo" = 'local' AND "estado" = 'Programada';
-- Una visita a domicilio por franja y día.
CREATE UNIQUE INDEX "cita_franja_visita_unica" ON "cita" ("fecha_hora", "franja") WHERE "tipo" = 'domicilio' AND "estado" = 'Programada';
-- Una sola cita programada por solicitud.
CREATE UNIQUE INDEX "cita_una_programada_por_solicitud" ON "cita" ("solicitud_id") WHERE "estado" = 'Programada';

ALTER TABLE "notificacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cita" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_bloqueo" ENABLE ROW LEVEL SECURITY;
