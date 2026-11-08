-- Diseño v4 (W2): ya no se envía muestra de tela a casa; la tela se elige en el catálogo, en el local o en la visita.
-- DropForeignKey
ALTER TABLE "solicitud" DROP CONSTRAINT "solicitud_direccion_muestra_id_fkey";

-- DropForeignKey
ALTER TABLE "solicitud" DROP CONSTRAINT "solicitud_tela_confirmada_id_fkey";

-- AlterTable
ALTER TABLE "solicitud" DROP COLUMN "direccion_muestra_id",
DROP COLUMN "fecha_muestra_enviada",
DROP COLUMN "muestra",
DROP COLUMN "muestra_estado",
DROP COLUMN "tela_confirmada_id";

