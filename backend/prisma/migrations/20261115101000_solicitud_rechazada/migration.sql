-- La respuesta en la cita o la visita (A2b · decisiones L): una solicitud cuya cotización se rechaza queda «Rechazada».
ALTER TABLE "solicitud" DROP CONSTRAINT "solicitud_estado_check";
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_estado_check"
  CHECK ("estado" IN ('Nueva', 'En espera de cita', 'Atendida', 'Cotizada', 'Rechazada', 'Vencida', 'Descartada'));

-- Ciclo de la cotización (RG-09): un solo juego de estados.
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_estado_check" CHECK ("estado" IN (
  'Borrador', 'Pendiente de respuesta', 'Aceptada: pendiente de adelanto', 'Aceptada', 'Rechazada', 'Vencida', 'Reemplazada'));
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_motivo_rechazo_check" CHECK ("estado" <> 'Rechazada' OR "motivo_rechazo" IS NOT NULL);
