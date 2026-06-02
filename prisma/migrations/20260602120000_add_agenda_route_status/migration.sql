ALTER TYPE "public"."EstadoAgenda" ADD VALUE IF NOT EXISTS 'EN_RUTA';

ALTER TABLE "public"."AgendaVisita"
ADD COLUMN IF NOT EXISTS "fechaInicioRuta" TIMESTAMP(3);
