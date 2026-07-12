ALTER TYPE "public"."EstadoAgenda" ADD VALUE IF NOT EXISTS 'INICIADA';

ALTER TABLE "public"."AgendaVisita"
ADD COLUMN IF NOT EXISTS "fechaInicioVisita" TIMESTAMP(3);
