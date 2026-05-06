import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =========================
   CREAR ENTREGA
========================= */
export const crearEntrega = async (req: Request, res: Response) => {
  try {
    const tecnicoId = (req as any).user?.id;

    if (!tecnicoId) {
      return res.status(401).json({ error: "Técnico no autenticado" });
    }

    const { empresaNombre, receptorNombre, fecha } = req.body ?? {};

    if (!empresaNombre?.trim() || !receptorNombre?.trim()) {
      return res
        .status(400)
        .json({ error: "empresaNombre y receptorNombre son obligatorios" });
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
        tecnicoId,
      },
    });

    return res.status(201).json({ entrega });
  } catch (err) {
    console.error("Error al crear entrega:", err);
    return res.status(500).json({ error: "Error interno al crear la entrega" });
  }
};

/* =========================
   HISTORIAL DEL TÉCNICO
========================= */
export const listarEntregas = async (req: any, res: Response) => {
  try {
    const tecnicoId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit);
    const limit = Math.min(100, Math.max(1, Number.isNaN(limitRaw) ? 20 : limitRaw));
    const skip = (page - 1) * limit;
    const includeEvidencias = req.query.includeEvidencias !== "false";

    const where = { tecnicoId };
    const [total, entregas] = await Promise.all([
      prisma.entrega.count({ where }),
      includeEvidencias
        ? prisma.entrega.findMany({
            where,
            orderBy: { fecha: "desc" },
            skip,
            take: limit,
            include: { evidencias: true },
          })
        : prisma.entrega.findMany({
            where,
            orderBy: { fecha: "desc" },
            skip,
            take: limit,
            select: {
              id_entrega: true,
              empresaNombre: true,
              receptorNombre: true,
              fecha: true,
              tecnicoId: true,
              _count: {
                select: { evidencias: true },
              },
            },
          }),
    ]);

    res.json({
      entregas,
      page,
      limit,
      total,
      hasMore: skip + entregas.length < total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al listar entregas' });
  }
};

/* =========================
   OBTENER ENTREGA POR ID
========================= */
export const obtenerEntrega = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const entrega = await prisma.entrega.findUnique({
      where: { id_entrega: id },
      include: {
        evidencias: true,
        tecnico: {
          select: { id_tecnico: true, nombre: true, email: true },
        },
      },
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
