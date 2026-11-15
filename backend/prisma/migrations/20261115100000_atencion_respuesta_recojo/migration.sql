-- AlterTable
ALTER TABLE "cotizacion" ADD COLUMN     "fecha_respuesta" TIMESTAMPTZ,
ADD COLUMN     "medio_respuesta" VARCHAR(20),
ADD COLUMN     "motivo_rechazo" VARCHAR(60);

-- AlterTable
ALTER TABLE "pedido" ADD COLUMN     "cotizacion_id" INTEGER;

-- CreateTable
CREATE TABLE "pago" (
    "id" SERIAL NOT NULL,
    "cotizacion_id" INTEGER NOT NULL,
    "pedido_id" INTEGER,
    "concepto" VARCHAR(20) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo" VARCHAR(15) NOT NULL,
    "origen" VARCHAR(15) NOT NULL,
    "estado" VARCHAR(15) NOT NULL DEFAULT 'Confirmado',
    "registrado_por" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recojo" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "tipo" VARCHAR(12) NOT NULL,
    "fecha" DATE,
    "hora" VARCHAR(5),
    "duracion_min" INTEGER NOT NULL,
    "direccion_id" INTEGER,
    "estado" VARCHAR(15) NOT NULL,
    "registrado_por" INTEGER NOT NULL,
    "fecha_registro" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recojo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pago_pedido_id_idx" ON "pago"("pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "recojo_pedido_id_key" ON "recojo"("pedido_id");

-- CreateIndex
CREATE INDEX "recojo_fecha_estado_idx" ON "recojo"("fecha", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_cotizacion_id_key" ON "pedido"("cotizacion_id");

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recojo" ADD CONSTRAINT "recojo_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recojo" ADD CONSTRAINT "recojo_direccion_id_fkey" FOREIGN KEY ("direccion_id") REFERENCES "direccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recojo" ADD CONSTRAINT "recojo_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que Prisma no expresa.
ALTER TABLE "pago" ADD CONSTRAINT "pago_check" CHECK ("monto" > 0
  AND "concepto" IN ('adelanto', 'saldo')
  AND "metodo" IN ('efectivo', 'tarjeta', 'zelle', 'cheque', 'transferencia')
  AND "origen" IN ('visita', 'local')
  AND "estado" IN ('Por confirmar', 'Confirmado', 'Rechazado', 'Anulado'));
ALTER TABLE "recojo" ADD CONSTRAINT "recojo_check" CHECK ("tipo" IN ('agendado', 'en_visita')
  AND "estado" IN ('Programado', 'Realizado', 'Cancelado')
  AND "duracion_min" > 0
  AND ("tipo" <> 'agendado' OR ("fecha" IS NOT NULL AND "hora" IS NOT NULL)));
-- Un camión: un solo recojo programado por hora (decisiones L). Si dos personas eligen la misma hora, gana la primera.
CREATE UNIQUE INDEX "recojo_una_por_hora" ON "recojo" ("fecha", "hora") WHERE "tipo" = 'agendado' AND "estado" = 'Programado';

-- Supabase: sin acceso directo desde el cliente.
ALTER TABLE "pago" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recojo" ENABLE ROW LEVEL SECURITY;
