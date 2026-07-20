-- Rollback de 20260720205321_add_agenda_destino_sucursal.
-- No es ejecutado automáticamente por Prisma; referencia manual si hace falta revertir.
-- Seguro: solo elimina columnas/índice nuevos, sin pérdida de datos preexistentes
-- (las columnas nacen vacías).

DROP INDEX IF EXISTS "AgendaVisita_sucursalId_idx";

ALTER TABLE "AgendaVisita"
  DROP COLUMN IF EXISTS "sucursalId",
  DROP COLUMN IF EXISTS "destinoNombre",
  DROP COLUMN IF EXISTS "destinoDireccion",
  DROP COLUMN IF EXISTS "destinoLatitud",
  DROP COLUMN IF EXISTS "destinoLongitud";
