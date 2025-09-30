-- CreateTable
CREATE TABLE "public"."Equipo" (
    "id_equipo" SERIAL NOT NULL,
    "idSolicitante" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "procesador" TEXT NOT NULL,
    "ram" TEXT NOT NULL,
    "disco" TEXT NOT NULL,
    "propiedad" TEXT NOT NULL,

    CONSTRAINT "Equipo_pkey" PRIMARY KEY ("id_equipo")
);

-- CreateIndex
CREATE INDEX "Equipo_idSolicitante_idx" ON "public"."Equipo"("idSolicitante");

-- AddForeignKey
ALTER TABLE "public"."Equipo" ADD CONSTRAINT "Equipo_idSolicitante_fkey" FOREIGN KEY ("idSolicitante") REFERENCES "public"."Solicitante"("id_solicitante") ON DELETE RESTRICT ON UPDATE CASCADE;
