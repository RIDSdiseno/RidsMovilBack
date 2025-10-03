/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Solicitante` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Solicitante_telefono_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "Solicitante_email_key" ON "public"."Solicitante"("email");
