-- CreateEnum
CREATE TYPE "public"."EstadoVisita" AS ENUM ('PENDIENTE', 'COMPLETADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "public"."Tecnico" (
    "id_tecnico" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "Tecnico_pkey" PRIMARY KEY ("id_tecnico")
);

-- CreateTable
CREATE TABLE "public"."Empresa" (
    "id_empresa" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id_empresa")
);

-- CreateTable
CREATE TABLE "public"."Visita" (
    "id_visita" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "solicitante" TEXT NOT NULL,
    "realizado" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "confImpresoras" BOOLEAN NOT NULL DEFAULT false,
    "confTelefonos" BOOLEAN NOT NULL DEFAULT false,
    "confPiePagina" BOOLEAN NOT NULL DEFAULT false,
    "otros" BOOLEAN NOT NULL DEFAULT false,
    "otrosDetalle" TEXT,
    "status" "public"."EstadoVisita" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "Visita_pkey" PRIMARY KEY ("id_visita")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tecnico_email_key" ON "public"."Tecnico"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_nombre_key" ON "public"."Empresa"("nombre");

-- AddForeignKey
ALTER TABLE "public"."Visita" ADD CONSTRAINT "Visita_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "public"."Empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Visita" ADD CONSTRAINT "Visita_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "public"."Tecnico"("id_tecnico") ON DELETE RESTRICT ON UPDATE CASCADE;
