/*
  Warnings:

  - The primary key for the `Historial` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Historial` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Historial" DROP CONSTRAINT "Historial_pkey",
DROP COLUMN "id",
ADD COLUMN     "id_historial" SERIAL NOT NULL,
ADD CONSTRAINT "Historial_pkey" PRIMARY KEY ("id_historial");
