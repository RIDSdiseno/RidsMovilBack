// Reconciliación de los adicionales de un equipo.
//
// Vive fuera del controlador para poder probarse: la lógica de emparejamiento
// no es obvia y un error acá borra datos silenciosamente.

export type AdicionalEntrada = {
  id: number | null;
  tipo: string;
  descripcion: string | null;
  cantidad: number;
  serialAdicional: string | null;
};

export type AdicionalExistente = {
  id: number;
  tipo: string;
  descripcion: string | null;
  serialAdicional: string | null;
};

function claveSerial(valor: string | null) {
  const limpio = (valor ?? "").trim().toUpperCase();
  return limpio || null;
}

/**
 * Decide qué adicionales se actualizan, cuáles se crean y cuáles se eliminan.
 *
 * La app no envía el id de cada adicional (lo descarta al armar el
 * formulario), así que el emparejamiento va por prioridad: primero id explícito
 * si viniera, después serial -- que ahora es único a nivel global y por lo
 * tanto es una clave sólida -- y por último tipo + descripción, y luego solo
 * tipo, tomando la primera fila libre. Cada fila existente se empareja una sola
 * vez.
 */
export function emparejarAdicionales(
  entradas: readonly AdicionalEntrada[],
  existentes: readonly AdicionalExistente[],
) {
  const disponibles = new Map(existentes.map((item) => [item.id, item]));
  const actualizar: { entrada: AdicionalEntrada; existenteId: number }[] = [];
  const crear: AdicionalEntrada[] = [];

  const tomar = (predicado: (item: AdicionalExistente) => boolean) => {
    for (const item of disponibles.values()) {
      if (predicado(item)) {
        disponibles.delete(item.id);
        return item;
      }
    }
    return null;
  };

  const pendientes: AdicionalEntrada[] = [];

  // Pasada 1: id explícito y serial. Son claves exactas, así que tienen
  // prioridad sobre cualquier coincidencia por texto.
  for (const entrada of entradas) {
    const porId = entrada.id !== null && disponibles.has(entrada.id)
      ? disponibles.get(entrada.id)!
      : null;

    if (porId) {
      disponibles.delete(porId.id);
      actualizar.push({ entrada, existenteId: porId.id });
      continue;
    }

    const serial = claveSerial(entrada.serialAdicional);
    const porSerial = serial
      ? tomar((item) => claveSerial(item.serialAdicional) === serial)
      : null;

    if (porSerial) {
      actualizar.push({ entrada, existenteId: porSerial.id });
      continue;
    }

    pendientes.push(entrada);
  }

  // Pasada 2: coincidencia por texto para los que no tienen clave exacta.
  for (const entrada of pendientes) {
    const porTipoYDescripcion = tomar(
      (item) => item.tipo === entrada.tipo && (item.descripcion ?? null) === entrada.descripcion,
    );

    const coincidencia = porTipoYDescripcion ?? tomar((item) => item.tipo === entrada.tipo);

    if (coincidencia) {
      actualizar.push({ entrada, existenteId: coincidencia.id });
      continue;
    }

    crear.push(entrada);
  }

  return {
    actualizar,
    crear,
    eliminar: [...disponibles.keys()],
  };
}
