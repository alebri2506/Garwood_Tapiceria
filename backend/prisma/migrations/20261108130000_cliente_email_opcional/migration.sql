-- A3: el Administrador registra solicitudes de clientes que llaman o vienen al local; el correo de la persona es opcional.
-- AlterTable
ALTER TABLE "cliente" ALTER COLUMN "email" DROP NOT NULL;

