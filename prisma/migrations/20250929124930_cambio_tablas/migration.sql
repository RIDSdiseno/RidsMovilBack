-- CreateTable
CREATE TABLE "public"."Solicitante" (
    "id_solicitante" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "Solicitante_pkey" PRIMARY KEY ("id_solicitante")
);

-- CreateTable
CREATE TABLE "public"."Historial" (
    "id_historial" SERIAL NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "solicitante" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "realizado" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Historial_pkey" PRIMARY KEY ("id_historial")
);

-- CreateIndex
CREATE INDEX "Solicitante_empresaId_idx" ON "public"."Solicitante"("empresaId");

-- CreateIndex
CREATE INDEX "Historial_tecnicoId_idx" ON "public"."Historial"("tecnicoId");

-- AddForeignKey
ALTER TABLE "public"."Solicitante" ADD CONSTRAINT "Solicitante_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "public"."Empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Historial" ADD CONSTRAINT "Historial_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "public"."Tecnico"("id_tecnico") ON DELETE RESTRICT ON UPDATE CASCADE;
