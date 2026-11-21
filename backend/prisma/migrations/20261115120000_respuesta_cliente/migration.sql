-- W4: el cliente responde la cotización desde su cuenta; su comentario (opcional) queda con la respuesta.
ALTER TABLE "cotizacion" ADD COLUMN "comentario_respuesta" VARCHAR(500);
