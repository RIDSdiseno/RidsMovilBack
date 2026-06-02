# Migraciones Prisma RidsMovilBack

## Contexto

El proyecto `RidsMovilBack` tiene una base PostgreSQL real cuyo estado actual no coincide completamente con el historial local de `prisma/migrations`.

Durante las etapas 2, 3 y 4 se necesitaron cambios nuevos para agenda, ruta y GPS foreground. Al intentar usar:

```bash
npx prisma migrate deploy
```

Prisma intento ejecutar migraciones antiguas desfasadas y fallo en `20251002121248_` porque intentaba operar sobre una columna que ya no existia en la base actual.

Por seguridad no se uso `prisma migrate reset`, no se eliminaron tablas y no se recreo la base.

## Migraciones aplicadas manualmente

Estas migraciones fueron ejecutadas manualmente con `prisma db execute` porque `migrate deploy` estaba bloqueado por migraciones antiguas:

```bash
npx prisma db execute --file prisma/migrations/20260602120000_add_agenda_route_status/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260602133000_add_ubicacion_tecnico/migration.sql --schema prisma/schema.prisma
```

### 20260602120000_add_agenda_route_status

Cambios aplicados:

- Agrega el valor `EN_RUTA` al enum `EstadoAgenda`.
- Agrega la columna nullable `fechaInicioRuta` a la tabla `AgendaVisita`.

### 20260602133000_add_ubicacion_tecnico

Cambios aplicados:

- Crea la tabla `UbicacionTecnico`.
- Agrega columnas:
  - `id`
  - `tecnicoId`
  - `agendaId`
  - `latitud`
  - `longitud`
  - `precision`
  - `velocidad`
  - `estadoTracking`
  - `createdAt`
- Crea indices para `agendaId`, `createdAt`, `estadoTracking` y `tecnicoId`.

## Verificacion en base de datos

Se verifico contra PostgreSQL que existen:

- `AgendaVisita.fechaInicioRuta`
- valor `EN_RUTA` en `EstadoAgenda`
- tabla `UbicacionTecnico`
- columnas esperadas de `UbicacionTecnico`

La verificacion fue de solo lectura usando Prisma Client y consultas a:

- `_prisma_migrations`
- `information_schema.columns`
- `information_schema.tables`
- `pg_enum`
- `pg_type`

## Migraciones marcadas como aplicadas

Como los cambios ya existian en la base, se marcaron como aplicadas con:

```bash
npx prisma migrate resolve --applied 20260602120000_add_agenda_route_status
npx prisma migrate resolve --applied 20260602133000_add_ubicacion_tecnico
```

Esto no modifica tablas ni datos. Solo registra las migraciones en `_prisma_migrations`.

## Estado final

Validaciones ejecutadas:

```bash
npx prisma validate
npm run build
```

Ambas finalizaron correctamente.

`npx prisma migrate status` ya no muestra pendientes las migraciones nuevas:

- `20260602120000_add_agenda_route_status`
- `20260602133000_add_ubicacion_tecnico`

Pero todavia informa diferencias legacy anteriores:

- Pendientes locales no aplicadas:
  - `20251002121729_`
  - `20260508120000_add_pdf_evidencia_entrega`
- Existe en la base pero no localmente:
  - `20251003_baseline`

Tambien existe antecedente de una migracion antigua fallida en `_prisma_migrations`:

- `20251002121248_`

Estas diferencias no pertenecen a Etapa 4/4.5 y deben tratarse como una tarea separada de baseline historico.

## Recomendacion para futuras migraciones

Hasta ordenar el baseline legacy completo:

1. No usar `prisma migrate reset` contra bases reales.
2. No ejecutar `migrate deploy` sin revisar antes `migrate status`.
3. Para cambios nuevos:
   - crear migracion SQL revisable,
   - aplicar con `prisma db execute` si `migrate deploy` sigue bloqueado,
   - verificar la estructura en PostgreSQL,
   - marcar con `migrate resolve --applied` solo si el SQL ya fue aplicado correctamente.
4. Planificar una tarea separada para alinear el baseline historico:
   - recuperar o recrear localmente `20251003_baseline`,
   - decidir el tratamiento de `20251002121248_`,
   - revisar si `20251002121729_` y `20260508120000_add_pdf_evidencia_entrega` ya estan reflejadas en la base real antes de marcarlas.

