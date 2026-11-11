-- Mi perfil del cliente (W10) · cambio de correo con confirmación (decisiones-recientes.md E.1.4).
-- El pedido queda aquí hasta que el cliente abre el enlace enviado al correo nuevo; recién entonces se aplica.

CREATE TABLE "cambio_correo" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "email_nuevo" VARCHAR(160) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "fecha_expiracion" TIMESTAMPTZ NOT NULL,
    "fecha_uso" TIMESTAMPTZ,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambio_correo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cambio_correo_token_hash_key" ON "cambio_correo"("token_hash");
CREATE INDEX "cambio_correo_usuario_id_idx" ON "cambio_correo"("usuario_id");

ALTER TABLE "cambio_correo" ADD CONSTRAINT "cambio_correo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Igual que las demás tablas: cerrada a la API REST pública de Supabase (ver 20261103010000_seguridad_rls).
ALTER TABLE "cambio_correo" ENABLE ROW LEVEL SECURITY;
