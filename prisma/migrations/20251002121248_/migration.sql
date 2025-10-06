/*
  Warnings:

  - You are about to drop the column `realizado` on the `Visita` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Visita" DROP COLUMN "realizado",
ADD COLUMN     "actualizaciones" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "antivirus" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ccleaner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estadoDisco" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "licenciaOffice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "licenciaWindows" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mantenimientoReloj" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rendimientoEquipo" BOOLEAN NOT NULL DEFAULT false;
