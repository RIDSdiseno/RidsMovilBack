-- Selección de sucursal al agendar + snapshot de destino en AgendaVisita.
--
-- Tabla física confirmada por lectura directa de information_schema.columns
-- (solo lectura, sin migraciones previas ejecutadas): "AgendaVisita"
-- (sin @@map, nombre exacto con mayúscula, por eso requiere comillas dobles).
--
-- sucursalId: FK "logica" hacia "Sucursal" (relationMode = "prisma" => sin
-- constraint física real, igual que el resto de las relaciones del proyecto).
-- destinoNombre/destinoDireccion/destinoLatitud/destinoLongitud: snapshot
-- congelado del destino al momento de crear/editar la agenda (igual tipo
-- Float que UbicacionTecnico/DetalleEmpresa/Sucursal ya usan para coordenadas).
--
-- Columnas nullable, sin DEFAULT, sin NOT NULL, sin foreign keys, sin backfill.
-- Idempotente: usa IF NOT EXISTS, seguro de re-ejecutar sin efecto si ya existen.

ALTER TABLE "AgendaVisita"
  ADD COLUMN IF NOT EXISTS "sucursalId" INTEGER,
  ADD COLUMN IF NOT EXISTS "destinoNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "destinoDireccion" TEXT,
  ADD COLUMN IF NOT EXISTS "destinoLatitud" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "destinoLongitud" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "AgendaVisita_sucursalId_idx" ON "AgendaVisita" ("sucursalId");
