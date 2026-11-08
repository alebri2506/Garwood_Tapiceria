-- CU-C01 Registrar solicitud de cotización: tipos de mueble y sus partes, catálogo de telas, direcciones del cliente
-- y la solicitud con sus muebles, telas y fotos o videos.

-- CreateTable
CREATE TABLE "tipo_mueble" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_mueble_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_mueble_parte" (
    "id" SERIAL NOT NULL,
    "tipo_mueble_id" INTEGER NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "tipo_mueble_parte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "categoria" VARCHAR(30) NOT NULL,
    "familia" VARCHAR(30),
    "pattern" VARCHAR(20),
    "numero_color" VARCHAR(10),
    "color_hex" CHAR(7),
    "descripcion" VARCHAR(160),
    "unidad_medida" VARCHAR(10) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direccion" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "etiqueta" VARCHAR(40),
    "direccion" VARCHAR(200) NOT NULL,
    "referencia" VARCHAR(120),
    "ciudad" VARCHAR(80),
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "guardada" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(12),
    "cliente_id" INTEGER NOT NULL,
    "canal" VARCHAR(20) NOT NULL,
    "tela_opcion" VARCHAR(12) NOT NULL,
    "misma_tela" BOOLEAN NOT NULL DEFAULT true,
    "tela_descripcion" VARCHAR(200),
    "tela_conocida" VARCHAR(80),
    "muestra" BOOLEAN NOT NULL DEFAULT false,
    "direccion_muestra_id" INTEGER,
    "traslado" VARCHAR(12),
    "direccion_id" INTEGER,
    "fecha_pref_recojo" DATE,
    "franja_recojo" VARCHAR(10),
    "estado" VARCHAR(30) NOT NULL,
    "fecha_solicitud" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por" INTEGER NOT NULL,

    CONSTRAINT "solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_mueble" (
    "id" SERIAL NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "tipo_mueble_id" INTEGER NOT NULL,
    "servicio" VARCHAR(20) NOT NULL,
    "acabado" VARCHAR(12),
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "medidas" VARCHAR(120),
    "modo_tela" VARCHAR(10),

    CONSTRAINT "solicitud_mueble_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_tela" (
    "id" SERIAL NOT NULL,
    "solicitud_mueble_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "parte_id" INTEGER,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "solicitud_tela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_adjunto" (
    "id" SERIAL NOT NULL,
    "solicitud_mueble_id" INTEGER NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "nombre_original" VARCHAR(160) NOT NULL,
    "ruta" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(60) NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "fecha_subida" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_adjunto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_mueble_codigo_key" ON "tipo_mueble"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_mueble_nombre_key" ON "tipo_mueble"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_mueble_parte_tipo_mueble_id_orden_key" ON "tipo_mueble_parte"("tipo_mueble_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "material_codigo_key" ON "material"("codigo");

-- CreateIndex
CREATE INDEX "material_categoria_activo_idx" ON "material"("categoria", "activo");

-- CreateIndex
CREATE INDEX "direccion_cliente_id_idx" ON "direccion"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_codigo_key" ON "solicitud"("codigo");

-- CreateIndex
CREATE INDEX "solicitud_cliente_id_fecha_solicitud_idx" ON "solicitud"("cliente_id", "fecha_solicitud");

-- CreateIndex
CREATE INDEX "solicitud_estado_idx" ON "solicitud"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_mueble_solicitud_id_orden_key" ON "solicitud_mueble"("solicitud_id", "orden");

-- AddForeignKey
ALTER TABLE "tipo_mueble_parte" ADD CONSTRAINT "tipo_mueble_parte_tipo_mueble_id_fkey" FOREIGN KEY ("tipo_mueble_id") REFERENCES "tipo_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direccion" ADD CONSTRAINT "direccion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_direccion_id_fkey" FOREIGN KEY ("direccion_id") REFERENCES "direccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_direccion_muestra_id_fkey" FOREIGN KEY ("direccion_muestra_id") REFERENCES "direccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_mueble" ADD CONSTRAINT "solicitud_mueble_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_mueble" ADD CONSTRAINT "solicitud_mueble_tipo_mueble_id_fkey" FOREIGN KEY ("tipo_mueble_id") REFERENCES "tipo_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_tela" ADD CONSTRAINT "solicitud_tela_solicitud_mueble_id_fkey" FOREIGN KEY ("solicitud_mueble_id") REFERENCES "solicitud_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_tela" ADD CONSTRAINT "solicitud_tela_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_tela" ADD CONSTRAINT "solicitud_tela_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "tipo_mueble_parte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_adjunto" ADD CONSTRAINT "solicitud_adjunto_solicitud_mueble_id_fkey" FOREIGN KEY ("solicitud_mueble_id") REFERENCES "solicitud_mueble"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Valores permitidos (convención de la tesis: estados y opciones como varchar con CHECK).
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_estado_check"
  CHECK ("estado" IN ('Nueva', 'En espera de cita', 'Atendida', 'Cotizada', 'Vencida', 'Descartada'));
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_tela_opcion_check"
  CHECK ("tela_opcion" IN ('trae', 'catalogo', 'local', 'domicilio', 'sin'));
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_traslado_check" CHECK ("traslado" IS NULL OR "traslado" IN ('delivery', 'propio'));
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_franja_check" CHECK ("franja_recojo" IS NULL OR "franja_recojo" IN ('manana', 'tarde'));
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_canal_check" CHECK ("canal" IN ('web', 'telefono', 'local', 'correo', 'mensaje'));
ALTER TABLE "solicitud_mueble" ADD CONSTRAINT "solicitud_mueble_servicio_check"
  CHECK ("servicio" IN ('retapizado', 'retapizado_espuma', 'espuma', 'estructura', 'fabricacion'));
ALTER TABLE "solicitud_mueble" ADD CONSTRAINT "solicitud_mueble_acabado_check" CHECK ("acabado" IS NULL OR "acabado" IN ('liso', 'capitoneado', 'canales'));
ALTER TABLE "solicitud_mueble" ADD CONSTRAINT "solicitud_mueble_modo_tela_check" CHECK ("modo_tela" IS NULL OR "modo_tela" IN ('una', 'partes'));
ALTER TABLE "solicitud_mueble" ADD CONSTRAINT "solicitud_mueble_cantidad_check" CHECK ("cantidad" BETWEEN 1 AND 99);
ALTER TABLE "solicitud_adjunto" ADD CONSTRAINT "solicitud_adjunto_tipo_check" CHECK ("tipo" IN ('foto', 'video'));

-- Igual que en las tablas de Seguridad: RLS sin políticas para que la API REST de Supabase no las exponga.
ALTER TABLE "tipo_mueble" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tipo_mueble_parte" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "direccion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "solicitud" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "solicitud_mueble" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "solicitud_tela" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "solicitud_adjunto" ENABLE ROW LEVEL SECURITY;
