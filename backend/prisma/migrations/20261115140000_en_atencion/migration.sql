-- A2b (decisiones L.2.10): «Empezar» la cita o la visita la deja «En atención» (y su solicitud también) hasta que se
-- registra la respuesta del cliente; recién ahí la cita pasa a «Atendida» y la solicitud a «Cotizada».
ALTER TABLE "cita" DROP CONSTRAINT "cita_estado_check";
ALTER TABLE "cita" ADD CONSTRAINT "cita_estado_check"
  CHECK ("estado" IN ('Programada', 'En atención', 'Atendida', 'No asistió', 'Reprogramada', 'Cancelada'));

ALTER TABLE "solicitud" DROP CONSTRAINT "solicitud_estado_check";
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_estado_check"
  CHECK ("estado" IN ('Nueva', 'En espera de cita', 'En atención', 'Atendida', 'Cotizada', 'Rechazada', 'Vencida', 'Descartada'));
