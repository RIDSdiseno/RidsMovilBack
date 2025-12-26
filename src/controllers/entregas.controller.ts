// src/controllers/entregas.controller.ts

import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const crearEntrega = async (req: Request, res: Response) => {
  try {
    const { empresaNombre, receptorNombre, fecha } = req.body ?? {};

    if (!empresaNombre?.trim() || !receptorNombre?.trim()) {
      return res.status(400).json({ error: "empresaNombre y receptorNombre son obligatorios" });
    }

    const parsedFecha = fecha ? new Date(fecha) : new Date();
    if (Number.isNaN(parsedFecha.getTime())) {
      return res.status(400).json({ error: "fecha inválida" });
    }

    const entrega = await prisma.entrega.create({
      data: {
        empresaNombre: empresaNombre.trim(),
        receptorNombre: receptorNombre.trim(),
        fecha: parsedFecha,
      },
    });

    return res.status(201).json({ entrega });
  } catch (err) {
    console.error("Error al crear entrega:", err);
    return res.status(500).json({ error: "Error interno al crear la entrega" });
  }
};

export const obtenerEntrega = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const entrega = await prisma.entrega.findUnique({
      where: { id_entrega: id },
      include: { evidencias: true },
    });

    if (!entrega) {
      return res.status(404).json({ error: "Entrega no encontrada" });
    }

    return res.json({ entrega });
  } catch (err) {
    console.error("Error al obtener entrega:", err);
    return res.status(500).json({ error: "Error interno al obtener la entrega" });
  }
};

export const listarEntregas = async (_req: Request, res: Response) => {
  try {
    const entregas = await prisma.entrega.findMany({
      orderBy: { fecha: "desc" },
      take: 50, // 🔥 límite razonable para mobile
      include: {
        _count: {
          select: { evidencias: true },
        },
      },
    });

    return res.json({ entregas });
  } catch (err) {
    console.error("Error al listar entregas:", err);
    return res.status(500).json({ error: "Error interno al listar entregas" });
  }
};

