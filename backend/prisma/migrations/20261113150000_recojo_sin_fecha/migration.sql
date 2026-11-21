-- Decisiones A.7 (13/11): con delivery el cliente ya no elige el recojo al pedir la cotización (W2): solo deja su dirección.
-- Lo elige él mismo, con la grilla de días y horas ligada a la agenda, cuando se confirma su pago y nace el pedido.
-- Por eso la hora preferida de W2 ya no reserva la agenda: sin índice de "una solicitud por hora". Las columnas
-- fecha_pref_recojo, franja_recojo y hora_pref_recojo se conservan con lo que guardaron las solicitudes anteriores.
DROP INDEX IF EXISTS "solicitud_recojo_hora_unica";
