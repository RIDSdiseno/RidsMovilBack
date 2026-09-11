CREATE TABLE IF NOT EXISTS "public"."EmpresaFavoritaTecnico" (
  "id" SERIAL NOT NULL,
  "tecnicoId" INTEGER NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "origen" VARCHAR(16) NOT NULL DEFAULT 'RIDS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmpresaFavoritaTecnico_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmpresaFavoritaTecnico_tecnicoId_origen_empresaId_key"
ON "public"."EmpresaFavoritaTecnico" ("tecnicoId", "origen", "empresaId");

CREATE INDEX IF NOT EXISTS "EmpresaFavoritaTecnico_tecnicoId_idx"
ON "public"."EmpresaFavoritaTecnico" ("tecnicoId");

CREATE INDEX IF NOT EXISTS "EmpresaFavoritaTecnico_origen_empresaId_idx"
ON "public"."EmpresaFavoritaTecnico" ("origen", "empresaId");
