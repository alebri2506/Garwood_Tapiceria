-- Mi perfil del cliente (W10 · CU-H02 · decisiones-recientes.md, sección E).

-- ─── cliente ───────────────────────────────────────────────────────────────────────────────────────
-- "Recordatorios y novedades del taller" (E.3.3): por ahora solo se guarda la preferencia; viene apagado.
-- acepta_avisos_correo (ya existía) queda como "avisos informativos por correo"; los obligatorios llegan siempre.
ALTER TABLE "cliente" ADD COLUMN "acepta_novedades" BOOLEAN NOT NULL DEFAULT false;

-- ─── direccion: una sola principal ────────────────────────────────────────────────────────────────
-- E.2.4: mientras tenga direcciones, cada cliente tiene UNA sola principal activa. Se garantiza en la base con un
-- trigger (no con un índice parcial, que Prisma no maneja y podría proponer borrar en una migración futura).
-- Hasta ahora nadie marcaba principales; por si acaso, si un cliente tuviera varias, se deja solo la más antigua.
UPDATE "direccion" d SET "es_principal" = false
  WHERE d."es_principal" AND d."activo"
    AND EXISTS (
      SELECT 1 FROM "direccion" o
      WHERE o."cliente_id" = d."cliente_id" AND o."es_principal" AND o."activo" AND o."id" < d."id"
    );

CREATE FUNCTION "direccion_una_principal"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW."es_principal" AND NEW."activo" AND EXISTS (
    SELECT 1 FROM "direccion"
    WHERE "cliente_id" = NEW."cliente_id" AND "es_principal" AND "activo" AND "id" <> NEW."id"
  ) THEN
    -- Código general (P0001): así el mensaje llega tal cual a la aplicación.
    RAISE EXCEPTION 'El cliente ya tiene una dirección principal (E.2.4).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "direccion_una_principal"
  BEFORE INSERT OR UPDATE OF "es_principal", "activo", "cliente_id" ON "direccion"
  FOR EACH ROW EXECUTE FUNCTION "direccion_una_principal"();
