-- Módulo de Pagos (A5 y W5 · CU-C12, C13 · decisiones J y N). Nada se borra (RG-03): un pago se rechaza o se anula con motivo.
-- `detalle`: lo que identifica un pago manual o informado (n.º de cheque, código de Zelle…). No es único, a diferencia de
--   `referencia`, que es el id del cobro en la pasarela.
-- `comprobante_*`: la captura de Zelle o la foto del cheque que sube el cliente (archivo privado).
-- `recibo`: REC-0000, uno por pago confirmado (C13). El PDF queda para después.
-- `revisado_por` / `fecha_revision` / `motivo_rechazo`: el Administrador confirma o rechaza un pago «Por confirmar».
-- `anulado_por` / `fecha_anulacion` / `motivo_anulacion`: anular un pago manual ya confirmado (p. ej. cheque devuelto).
-- `reemplaza_id`: el pago rechazado al que reemplaza el nuevo comprobante del cliente.
ALTER TABLE "pago"
  ADD COLUMN "detalle" VARCHAR(120),
  ADD COLUMN "comprobante_ruta" VARCHAR(200),
  ADD COLUMN "comprobante_mime" VARCHAR(60),
  ADD COLUMN "recibo" VARCHAR(12),
  ADD COLUMN "revisado_por" INTEGER,
  ADD COLUMN "fecha_revision" TIMESTAMPTZ,
  ADD COLUMN "motivo_rechazo" VARCHAR(200),
  ADD COLUMN "anulado_por" INTEGER,
  ADD COLUMN "fecha_anulacion" TIMESTAMPTZ,
  ADD COLUMN "motivo_anulacion" VARCHAR(200),
  ADD COLUMN "reemplaza_id" INTEGER;

CREATE UNIQUE INDEX "pago_recibo_key" ON "pago"("recibo");
CREATE UNIQUE INDEX "pago_reemplaza_id_key" ON "pago"("reemplaza_id");
CREATE INDEX "pago_estado_idx" ON "pago"("estado");
ALTER TABLE "pago" ADD CONSTRAINT "pago_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pago" ADD CONSTRAINT "pago_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pago" ADD CONSTRAINT "pago_reemplaza_id_fkey" FOREIGN KEY ("reemplaza_id") REFERENCES "pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nuevos orígenes: «cliente» (lo informa desde W5 con su comprobante) y «conductor» (cobro en la entrega, para Despacho).
ALTER TABLE "pago" DROP CONSTRAINT "pago_check";
ALTER TABLE "pago" ADD CONSTRAINT "pago_check" CHECK ("monto" > 0
  AND "concepto" IN ('adelanto', 'saldo')
  AND "metodo" IN ('efectivo', 'tarjeta', 'zelle', 'cheque', 'transferencia')
  AND "origen" IN ('visita', 'local', 'pasarela', 'cliente', 'conductor')
  AND "estado" IN ('Por confirmar', 'Confirmado', 'Rechazado', 'Anulado'));

-- Los pagos que ya estaban confirmados reciben su recibo, en el orden en que se registraron.
UPDATE "pago" p SET "recibo" = 'REC-' || LPAD(n.rn::text, 4, '0')
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "fecha", "id") AS rn FROM "pago" WHERE "estado" IN ('Confirmado', 'Anulado')) n
WHERE p."id" = n."id";
