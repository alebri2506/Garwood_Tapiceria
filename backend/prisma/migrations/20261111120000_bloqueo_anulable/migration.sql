-- A2: quitar un bloqueo de la agenda lo anula (no se borra): queda con quién y cuándo.
-- AlterTable
ALTER TABLE "agenda_bloqueo" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fecha_quitado" TIMESTAMPTZ,
ADD COLUMN     "quitado_por" INTEGER;
