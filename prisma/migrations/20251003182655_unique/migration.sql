/*
  Warnings:

  - A unique constraint covering the columns `[telefono,email]` on the table `Solicitante` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Solicitante_empresaId_email_key";

-- DropIndex
DROP INDEX "public"."Solicitante_empresaId_telefono_key";

-- CreateIndex
CREATE UNIQUE INDEX "Solicitante_telefono_email_key" ON "public"."Solicitante"("telefono", "email");
