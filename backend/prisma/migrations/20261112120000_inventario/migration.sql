-- Inventario (A15, A15b, A8, A8c, A8p, A9) y pedido con su propio código (CU-C14).
-- AlterTable
ALTER TABLE "material" ADD COLUMN     "color_familia" VARCHAR(20),
ADD COLUMN     "en_web" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fecha_precio" DATE,
ADD COLUMN     "libro" VARCHAR(60),
ADD COLUMN     "precio" DECIMAL(10,2),
ADD COLUMN     "proveedor_id" INTEGER,
ADD COLUMN     "stock_fisico" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "stock_minimo" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ubicacion" VARCHAR(30);

-- AlterTable
ALTER TABLE "parametro" ADD COLUMN     "opciones" VARCHAR(200);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "canal" VARCHAR(12) NOT NULL,
    "contacto" VARCHAR(40) NOT NULL,
    "dias_min" INTEGER NOT NULL,
    "dias_max" INTEGER NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "estado" VARCHAR(30) NOT NULL,
    "descripcion" VARCHAR(120) NOT NULL,
    "fecha_compromiso" DATE,
    "fecha_creacion" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva_material" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "retirado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserva_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encargo_tela" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "estado" VARCHAR(15) NOT NULL,
    "fecha_necesaria" DATE,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encargo_tela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "estado" VARCHAR(12) NOT NULL,
    "fecha_pedido" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_estimada" DATE,
    "fecha_llegada" TIMESTAMPTZ,
    "registrado_por" INTEGER NOT NULL,
    "recibido_por" INTEGER,

    CONSTRAINT "compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra_linea" (
    "id" SERIAL NOT NULL,
    "compra_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "encargo_id" INTEGER,

    CONSTRAINT "compra_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_inventario" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "motivo" VARCHAR(60) NOT NULL,
    "detalle" VARCHAR(200),
    "cantidad" DECIMAL(10,2) NOT NULL,
    "saldo" DECIMAL(10,2) NOT NULL,
    "pedido_id" INTEGER,
    "compra_id" INTEGER,
    "conteo_id" INTEGER,
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteo" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "conteo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteo_linea" (
    "id" SERIAL NOT NULL,
    "conteo_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "sistema" DECIMAL(10,2) NOT NULL,
    "contado" DECIMAL(10,2) NOT NULL,
    "motivo" VARCHAR(60),

    CONSTRAINT "conteo_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_nombre_key" ON "proveedor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_codigo_key" ON "pedido"("codigo");

-- CreateIndex
CREATE INDEX "pedido_estado_idx" ON "pedido"("estado");

-- CreateIndex
CREATE INDEX "reserva_material_material_id_activa_idx" ON "reserva_material"("material_id", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_material_pedido_id_material_id_key" ON "reserva_material"("pedido_id", "material_id");

-- CreateIndex
CREATE INDEX "encargo_tela_estado_idx" ON "encargo_tela"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "compra_codigo_key" ON "compra"("codigo");

-- CreateIndex
CREATE INDEX "compra_estado_idx" ON "compra"("estado");

-- CreateIndex
CREATE INDEX "compra_linea_material_id_idx" ON "compra_linea"("material_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_material_id_fecha_idx" ON "movimiento_inventario"("material_id", "fecha");

-- CreateIndex
CREATE INDEX "movimiento_inventario_fecha_idx" ON "movimiento_inventario"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "conteo_linea_conteo_id_material_id_key" ON "conteo_linea"("conteo_id", "material_id");

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_material" ADD CONSTRAINT "reserva_material_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_material" ADD CONSTRAINT "reserva_material_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encargo_tela" ADD CONSTRAINT "encargo_tela_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encargo_tela" ADD CONSTRAINT "encargo_tela_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_recibido_por_fkey" FOREIGN KEY ("recibido_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargo_tela"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_conteo_id_fkey" FOREIGN KEY ("conteo_id") REFERENCES "conteo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteo" ADD CONSTRAINT "conteo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteo_linea" ADD CONSTRAINT "conteo_linea_conteo_id_fkey" FOREIGN KEY ("conteo_id") REFERENCES "conteo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteo_linea" ADD CONSTRAINT "conteo_linea_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Igual que en las demás tablas: RLS sin políticas para que la API REST de Supabase no las exponga.
ALTER TABLE "proveedor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reserva_material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encargo_tela" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compra" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compra_linea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimiento_inventario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conteo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conteo_linea" ENABLE ROW LEVEL SECURITY;
