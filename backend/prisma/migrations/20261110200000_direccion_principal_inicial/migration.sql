-- Mi perfil del cliente (W10 · decisiones-recientes.md E.2.1 y E.2.4). Solo datos: no cambia ninguna tabla.
-- Hasta ahora nadie marcaba la dirección principal. A cada cliente que tiene direcciones guardadas en su perfil y
-- ninguna principal se le marca la más antigua, para que W2 la proponga al pedir delivery.
UPDATE "direccion" d SET "es_principal" = true
WHERE d."id" IN (
  SELECT DISTINCT ON (x."cliente_id") x."id"
  FROM "direccion" x
  WHERE x."guardada" AND x."activo"
    AND NOT EXISTS (
      SELECT 1 FROM "direccion" p
      WHERE p."cliente_id" = x."cliente_id" AND p."guardada" AND p."activo" AND p."es_principal"
    )
  ORDER BY x."cliente_id", x."fecha_creacion", x."id"
);
