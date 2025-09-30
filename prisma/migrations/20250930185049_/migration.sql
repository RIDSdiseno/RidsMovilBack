/*
  Warnings:

  - Added the required column `solicitanteId` to the `Historial` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Historial" ADD COLUMN     "solicitanteId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."Visita" ADD COLUMN     "solicitanteId" INTEGER;

-- CreateIndex
CREATE INDEX "Visita_tecnicoId_idx" ON "public"."Visita"("tecnicoId");

-- AddForeignKey
ALTER TABLE "public"."Visita" ADD CONSTRAINT "Visita_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "public"."Solicitante"("id_solicitante") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Historial" ADD CONSTRAINT "Historial_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "public"."Solicitante"("id_solicitante") ON DELETE RESTRICT ON UPDATE CASCADE;
