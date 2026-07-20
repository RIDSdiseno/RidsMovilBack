-- Etapa 1: coordenadas opcionales para empresas y sucursales (Mapa de Tecnicos).
--
-- Tablas fisicas confirmadas por lectura directa de information_schema.columns
-- (solo lectura, sin migraciones previas ejecutadas):
--   - detalle_empresas   (modelo Prisma DetalleEmpresa, mapeado via @@map("detalle_empresas"))
--   - "Sucursal"         (modelo Prisma Sucursal, sin @@map, nombre fisico exacto con mayuscula,
--                          por eso requiere comillas dobles en SQL)
--
-- Tipo elegido: DOUBLE PRECISION (equivalente fisico de Float en Prisma), igual tipo que
-- UbicacionTecnico.latitud / UbicacionTecnico.longitud (confirmado: double precision),
-- para mantener coherencia con el unico precedente de coordenadas ya existente en el schema.
--
-- Columnas nullable, sin DEFAULT, sin NOT NULL, sin foreign keys, sin backfill de datos.
-- Idempotente: usa IF NOT EXISTS, seguro de re-ejecutar sin efecto si ya existen.

ALTER TABLE detalle_empresas
  ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;

ALTER TABLE "Sucursal"
  ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;
