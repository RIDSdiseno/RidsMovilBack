// src/controllers/visitas-pendientes.controller.ts
//
// Visitas que quedaron abiertas: existen en el servidor en estado PENDIENTE
// pero el teléfono ya no tiene rastro de ellas (sesión vencida, cambio de
// dispositivo o un fallo al guardar el avance). Sin este listado el técnico no
// tenía forma de retomarlas ni de cerrarlas, y quedaban abiertas para siempre.

import type { Request, Response } from "express";
import { EstadoVisita } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 100;

export const listarVisitasPendientes = async (req: Request, res: Response) => {
  try {
    const tecnicoId = req.user?.id;
    if (!tecnicoId) return res.status(401).json({ error: "No autenticado" });

    // Paginación con el mismo criterio que el historial: página desde 1 y
    // límite acotado para que un parámetro suelto no pida la tabla entera.
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit);
    const limit = Math.min(
      LIMITE_MAXIMO,
      Math.max(1, Number.isNaN(limitRaw) ? LIMITE_POR_DEFECTO : limitRaw),
    );
    const skip = (page - 1) * limit;

    // Solo las del técnico autenticado: son su trabajo pendiente y nadie más
    // puede cerrarlas (completarVisita ya rechaza las ajenas).
    const where = { tecnicoId, status: EstadoVisita.PENDIENTE } as const;

    const [total, visitas] = await Promise.all([
      prisma.visita.count({ where }),
      prisma.visita.findMany({
      where,
      orderBy: { inicio: "desc" },
      skip,
      take: limit,
      select: {
        id_visita: true,
        inicio: true,
        agendaId: true,
        origen: true,
        sucursalId: true,
        direccion_visita: true,
        empresa: {
          select: { id_empresa: true, nombre: true, razonSocial: true },
        },
        agenda: {
          select: { id: true, estado: true, fecha: true, horaInicio: true },
        },
      },
      }),
    ]);

    return res.json({
      page,
      limit,
      total,
      hasMore: skip + visitas.length < total,
      visitas: visitas.map((visita) => ({
        id_visita: visita.id_visita,
        inicio: visita.inicio,
        origen: visita.origen,
        agendaId: visita.agendaId,
        sucursalId: visita.sucursalId,
        direccion_visita: visita.direccion_visita,
        empresa: visita.empresa,
        agendaEstado: visita.agenda?.estado ?? null,
        agendaFecha: visita.agenda?.fecha ?? null,
        agendaHoraInicio: visita.agenda?.horaInicio ?? null,
      })),
    });
  } catch (error) {
    console.error("Error al listar visitas pendientes:", error);
    return res.status(500).json({ error: "Error interno al listar las visitas pendientes" });
  }
};
