-- Pago en línea con pasarela (decisiones J · Stripe): el adelanto pagado por el cliente desde W4.
-- `referencia`: el id del pago en la pasarela (único: un mismo pago nunca se registra dos veces, aunque el aviso llegue repetido).
ALTER TABLE "pago" ADD COLUMN "referencia" VARCHAR(80);
CREATE UNIQUE INDEX "pago_referencia_key" ON "pago"("referencia");

-- Nuevo origen «pasarela» (además de visita y local).
ALTER TABLE "pago" DROP CONSTRAINT "pago_check";
ALTER TABLE "pago" ADD CONSTRAINT "pago_check" CHECK ("monto" > 0
  AND "concepto" IN ('adelanto', 'saldo')
  AND "metodo" IN ('efectivo', 'tarjeta', 'zelle', 'cheque', 'transferencia')
  AND "origen" IN ('visita', 'local', 'pasarela')
  AND "estado" IN ('Por confirmar', 'Confirmado', 'Rechazado', 'Anulado'));
