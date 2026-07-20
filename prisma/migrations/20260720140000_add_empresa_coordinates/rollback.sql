-- Rollback de 20260720140000_add_empresa_coordinates.
-- No es ejecutado automaticamente por Prisma (no sigue su convencion de nombre);
-- se deja como referencia manual en caso de necesitar revertir.
-- Seguro: solo elimina las 4 columnas nullable agregadas, sin perdida de datos
-- preexistentes (las columnas no tenian datos, ya que se crean vacias).

ALTER TABLE detalle_empresas
  DROP COLUMN IF EXISTS latitud,
  DROP COLUMN IF EXISTS longitud;

ALTER TABLE "Sucursal"
  DROP COLUMN IF EXISTS latitud,
  DROP COLUMN IF EXISTS longitud;
