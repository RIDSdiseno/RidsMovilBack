-- CreateEnum
CREATE TYPE "EstadoVisita" AS ENUM ('PENDIENTE', 'COMPLETADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Empresa" (
    "id_empresa" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id_empresa")
);

-- CreateTable
CREATE TABLE "Solicitante" (
    "id_solicitante" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "Solicitante_pkey" PRIMARY KEY ("id_solicitante")
);

-- CreateTable
CREATE TABLE "Equipo" (
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

-- CreateTable
CREATE TABLE "DetalleEquipo" (
    "id_detalle_equipo" SERIAL NOT NULL,
    "idEquipo" INTEGER NOT NULL,
    "macWifi" TEXT,
    "so" TEXT,
    "tipoDd" TEXT,
    "estadoAlm" TEXT,
    "office" TEXT,
    "correo" TEXT,
    "teamViewer" TEXT,
    "claveTv" TEXT,
    "revisado" TIMESTAMP(3),

    CONSTRAINT "DetalleEquipo_pkey" PRIMARY KEY ("id_detalle_equipo")
);

-- CreateTable
CREATE TABLE "Historial" (
    "id" SERIAL NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "solicitante" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "realizado" TEXT,
    "solicitanteId" INTEGER NOT NULL,
    "actualizaciones" BOOLEAN NOT NULL DEFAULT false,
    "antivirus" BOOLEAN NOT NULL DEFAULT false,
    "ccleaner" BOOLEAN NOT NULL DEFAULT false,
    "estadoDisco" BOOLEAN NOT NULL DEFAULT false,
    "licenciaOffice" BOOLEAN NOT NULL DEFAULT false,
    "licenciaWindows" BOOLEAN NOT NULL DEFAULT false,
    "mantenimientoReloj" BOOLEAN NOT NULL DEFAULT false,
    "rendimientoEquipo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "rtHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" INTEGER,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tecnico" (
    "id_tecnico" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tecnico_pkey" PRIMARY KEY ("id_tecnico")
);

-- CreateTable
CREATE TABLE "Visita" (
    "id_visita" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "solicitante" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "confImpresoras" BOOLEAN NOT NULL DEFAULT false,
    "confTelefonos" BOOLEAN NOT NULL DEFAULT false,
    "confPiePagina" BOOLEAN NOT NULL DEFAULT false,
    "otros" BOOLEAN NOT NULL DEFAULT false,
    "otrosDetalle" TEXT,
    "status" "EstadoVisita" NOT NULL DEFAULT 'PENDIENTE',
    "solicitanteId" INTEGER,
    "actualizaciones" BOOLEAN NOT NULL DEFAULT false,
    "antivirus" BOOLEAN NOT NULL DEFAULT false,
    "ccleaner" BOOLEAN NOT NULL DEFAULT false,
    "estadoDisco" BOOLEAN NOT NULL DEFAULT false,
    "licenciaOffice" BOOLEAN NOT NULL DEFAULT false,
    "licenciaWindows" BOOLEAN NOT NULL DEFAULT false,
    "mantenimientoReloj" BOOLEAN NOT NULL DEFAULT false,
    "rendimientoEquipo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Visita_pkey" PRIMARY KEY ("id_visita")
);

-- CreateTable
CREATE TABLE "FreshdeskCompanyMap" (
    "companyId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "domain" TEXT,

    CONSTRAINT "FreshdeskCompanyMap_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "FreshdeskRequesterMap" (
    "requesterId" INTEGER NOT NULL,
    "solicitanteId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "FreshdeskRequesterMap_pkey" PRIMARY KEY ("requesterId")
);

-- CreateTable
CREATE TABLE "FreshdeskTicket" (
    "id" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "type" TEXT,
    "requesterEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "capturedAt" TIMESTAMP(3),
    "empresaId" INTEGER,
    "solicitanteId" INTEGER,

    CONSTRAINT "FreshdeskTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_nombre_key" ON "Empresa"("nombre");

-- CreateIndex
CREATE INDEX "Solicitante_empresaId_idx" ON "Solicitante"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Solicitante_empresaId_email_key" ON "Solicitante"("empresaId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Solicitante_empresaId_telefono_key" ON "Solicitante"("empresaId", "telefono");

-- CreateIndex
CREATE INDEX "Equipo_idSolicitante_idx" ON "Equipo"("idSolicitante");

-- CreateIndex
CREATE INDEX "DetalleEquipo_idEquipo_idx" ON "DetalleEquipo"("idEquipo");

-- CreateIndex
CREATE INDEX "Historial_tecnicoId_idx" ON "Historial"("tecnicoId");

-- CreateIndex
CREATE INDEX "Historial_solicitanteId_idx" ON "Historial"("solicitanteId");

-- CreateIndex
CREATE INDEX "RefreshToken_rtHash_idx" ON "RefreshToken"("rtHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tecnico_email_key" ON "Tecnico"("email");

-- CreateIndex
CREATE INDEX "Visita_empresaId_idx" ON "Visita"("empresaId");

-- CreateIndex
CREATE INDEX "Visita_tecnicoId_idx" ON "Visita"("tecnicoId");

-- CreateIndex
CREATE INDEX "Visita_solicitanteId_idx" ON "Visita"("solicitanteId");

-- CreateIndex
CREATE INDEX "FreshdeskCompanyMap_empresaId_idx" ON "FreshdeskCompanyMap"("empresaId");

-- CreateIndex
CREATE INDEX "FreshdeskCompanyMap_domain_idx" ON "FreshdeskCompanyMap"("domain");

-- CreateIndex
CREATE INDEX "FreshdeskRequesterMap_empresaId_idx" ON "FreshdeskRequesterMap"("empresaId");

-- CreateIndex
CREATE INDEX "FreshdeskRequesterMap_solicitanteId_idx" ON "FreshdeskRequesterMap"("solicitanteId");

-- CreateIndex
CREATE INDEX "FreshdeskTicket_empresaId_idx" ON "FreshdeskTicket"("empresaId");

-- CreateIndex
CREATE INDEX "FreshdeskTicket_solicitanteId_idx" ON "FreshdeskTicket"("solicitanteId");

-- CreateIndex
CREATE INDEX "FreshdeskTicket_requesterEmail_idx" ON "FreshdeskTicket"("requesterEmail");

-- CreateIndex
CREATE INDEX "FreshdeskTicket_createdAt_idx" ON "FreshdeskTicket"("createdAt");
