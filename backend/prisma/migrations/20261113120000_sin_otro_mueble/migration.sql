-- «Otro mueble de interior» no es un tipo de mueble que ofrezca el taller: deja de ofrecerse en la solicitud (W2, A3).
-- No se borra (CLAUDE.md: nada de borrado físico): si alguna solicitud anterior lo usó, la conserva.
UPDATE "tipo_mueble" SET "activo" = false WHERE "codigo" = 'gen';
