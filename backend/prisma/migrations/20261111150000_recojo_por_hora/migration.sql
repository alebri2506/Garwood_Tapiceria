-- W2 (diseño del 11/11): el recojo preferido se elige por hora (bloques de 1 hora) y reserva la agenda.
-- AlterTable
ALTER TABLE "solicitud" ADD COLUMN     "hora_pref_recojo" VARCHAR(5);

-- Una sola solicitud por hora de recojo mientras espera (Nueva, Atendida o Cotizada): dos clientes no toman la misma hora.
CREATE UNIQUE INDEX "solicitud_recojo_hora_unica" ON "solicitud" ("fecha_pref_recojo", "hora_pref_recojo")
  WHERE "hora_pref_recojo" IS NOT NULL AND "estado" IN ('Nueva', 'Atendida', 'Cotizada');
