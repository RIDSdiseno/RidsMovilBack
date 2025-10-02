/*
  Warnings:

  - The primary key for the `Historial` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `creadoEn` on the `Historial` table. All the data in the column will be lost.
  - You are about to drop the column `id_historial` on the `Historial` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."Historial_tecnicoId_idx";

-- AlterTable
ALTER TABLE "public"."Historial" DROP CONSTRAINT "Historial_pkey",
DROP COLUMN "creadoEn",
DROP COLUMN "id_historial",
ADD COLUMN     "actualizaciones" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "antivirus" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ccleaner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estadoDisco" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "licenciaOffice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "licenciaWindows" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mantenimientoReloj" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rendimientoEquipo" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "realizado" DROP NOT NULL,
ADD CONSTRAINT "Historial_pkey" PRIMARY KEY ("id");
