import type { Request, Response } from "express";

import { prisma } from "../lib/prisma.js";

const ORIGENES_PERMITIDOS = new Set(["RIDS", "ECONNET"]);

function parseFavoritoParams(req: Request) {
  const tecnicoId = req.user?.id;
  const empresaId = Number(req.params.empresaId);
  const origen = String(req.params.origen ?? "").trim().toUpperCase();

  if (!tecnicoId) {
    return { error: "No se encontró el técnico autenticado.", ok: false, status: 401 } as const;
  }

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    return { error: "El identificador de empresa no es válido.", ok: false, status: 400 } as const;
  }

  if (!ORIGENES_PERMITIDOS.has(origen)) {
    return { error: "El origen de la empresa no es válido.", ok: false, status: 400 } as const;
  }

  return { tecnicoId, empresaId, ok: true, origen } as const;
}

export async function obtenerEmpresasFavoritas(req: Request, res: Response) {
  const tecnicoId = req.user?.id;

  if (!tecnicoId) {
    return res.status(401).json({ error: "No se encontró el técnico autenticado." });
  }

  try {
    const favoritos = await prisma.empresaFavoritaTecnico.findMany({
      where: { tecnicoId },
      orderBy: [{ origen: "asc" }, { createdAt: "asc" }],
      select: { empresaId: true, origen: true },
    });

    return res.json({ favoritos });
  } catch (error) {
    console.error("Error al obtener empresas favoritas:", error);
    return res.status(500).json({ error: "No se pudieron obtener las empresas favoritas." });
  }
}

export async function agregarEmpresaFavorita(req: Request, res: Response) {
  const params = parseFavoritoParams(req);
  if (!params.ok) return res.status(params.status).json({ error: params.error });

  try {
    const tecnico = await prisma.tecnico.findUnique({
      where: { id_tecnico: params.tecnicoId },
      select: { id_tecnico: true },
    });

    if (!tecnico) {
      return res.status(404).json({ error: "El técnico autenticado no existe." });
    }

    const favorito = await prisma.empresaFavoritaTecnico.upsert({
      where: {
        tecnicoId_origen_empresaId: {
          tecnicoId: params.tecnicoId,
          origen: params.origen,
          empresaId: params.empresaId,
        },
      },
      create: {
        tecnicoId: params.tecnicoId,
        origen: params.origen,
        empresaId: params.empresaId,
      },
      update: {},
      select: { empresaId: true, origen: true },
    });

    return res.json({ favorito });
  } catch (error) {
    console.error("Error al agregar empresa favorita:", error);
    return res.status(500).json({ error: "No se pudo guardar la empresa favorita." });
  }
}

export async function eliminarEmpresaFavorita(req: Request, res: Response) {
  const params = parseFavoritoParams(req);
  if (!params.ok) return res.status(params.status).json({ error: params.error });

  try {
    await prisma.empresaFavoritaTecnico.deleteMany({
      where: {
        tecnicoId: params.tecnicoId,
        origen: params.origen,
        empresaId: params.empresaId,
      },
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error al eliminar empresa favorita:", error);
    return res.status(500).json({ error: "No se pudo eliminar la empresa favorita." });
  }
}
