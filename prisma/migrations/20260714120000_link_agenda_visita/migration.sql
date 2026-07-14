DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrigenVisita'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."OrigenVisita" AS ENUM ('MANUAL', 'AGENDA');
  END IF;
END $$;

ALTER TABLE "public"."Visita"
ADD COLUMN IF NOT EXISTS "agendaId" INTEGER;

ALTER TABLE "public"."Visita"
ADD COLUMN IF NOT EXISTS "origen"
"public"."OrigenVisita" NOT NULL DEFAULT 'MANUAL';

CREATE UNIQUE INDEX IF NOT EXISTS "Visita_agendaId_key"
ON "public"."Visita" ("agendaId");
