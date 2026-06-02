CREATE TABLE IF NOT EXISTS "public"."UbicacionTecnico" (
  "id" SERIAL PRIMARY KEY,
  "tecnicoId" INTEGER NOT NULL,
  "agendaId" INTEGER,
  "latitud" DOUBLE PRECISION NOT NULL,
  "longitud" DOUBLE PRECISION NOT NULL,
  "precision" DOUBLE PRECISION,
  "velocidad" DOUBLE PRECISION,
  "estadoTracking" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "UbicacionTecnico_agendaId_idx"
ON "public"."UbicacionTecnico"("agendaId");

CREATE INDEX IF NOT EXISTS "UbicacionTecnico_createdAt_idx"
ON "public"."UbicacionTecnico"("createdAt");

CREATE INDEX IF NOT EXISTS "UbicacionTecnico_estadoTracking_idx"
ON "public"."UbicacionTecnico"("estadoTracking");

CREATE INDEX IF NOT EXISTS "UbicacionTecnico_tecnicoId_idx"
ON "public"."UbicacionTecnico"("tecnicoId");
