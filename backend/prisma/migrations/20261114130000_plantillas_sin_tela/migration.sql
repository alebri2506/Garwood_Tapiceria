-- A16 Plantillas: los materiales son solo de STOCK del Inventario. La tela la elige el cliente y se agrega en la cotización,
-- así que se quita la «tela de referencia» (material_id vacío).
-- Si alguna base tiene plantillas con esa tela, la migración se detiene (no se borran datos de negocio, RG-03).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "plantilla_material" WHERE "material_id" IS NULL) THEN
    RAISE EXCEPTION 'Hay plantillas con la tela de referencia: guárdelas sin tela antes de aplicar esta migración.';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "plantilla_material" DROP CONSTRAINT "plantilla_material_material_id_fkey";

-- AlterTable
ALTER TABLE "plantilla_material" ALTER COLUMN "material_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "plantilla_material" ADD CONSTRAINT "plantilla_material_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El parámetro `tarifa.tela_referencia` ya no se usa: se oculta de Parámetros (A14) sin borrarlo (sin grupo no se muestra).
UPDATE "parametro" SET "grupo" = NULL WHERE "clave" = 'tarifa.tela_referencia';
