// src/controllers/evidencias.controller.ts

import type { Request, Response } from "express";
import { Prisma, PrismaClient, TipoEvidenciaEntrega } from "@prisma/client";
import { buildEntregaFolder, createUploadSignature } from "../config/cloudinary.js";

const prisma = new PrismaClient();

const ALLOWED_FORMATS = new Set(["png", "jpg", "jpeg"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FOTOS_POR_ENTREGA = 10;

type EntregaInfo = {
  id_entrega: number;
};

type EvidenceInput = {
  tipo?: string;
  formato?: string;
  bytes?: number;
  url?: string;
  publicId?: string;
  vector?: unknown;
};

function normalizeTipo(tipo?: string): TipoEvidenciaEntrega | null {
  const val = (tipo || "").toString().trim().toLowerCase();
  if (val === "foto" || val === "image" || val === "foto_producto" || val === "foto_equipo") {
    return TipoEvidenciaEntrega.FOTO;
  }
  if (val === "firma" || val === "signature") {
    return TipoEvidenciaEntrega.FIRMA;
  }
  return null;
}

function normalizeFormat(format?: string) {
  const raw = (format || "").toString().trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("/")) {
    return raw.split("/").pop() || null;
  }
  if (raw.startsWith(".")) return raw.slice(1);
  return raw;
}

function buildPublicId(tipo: TipoEvidenciaEntrega, entregaId: number) {
  const prefix = tipo === TipoEvidenciaEntrega.FIRMA ? "firma" : "foto";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${entregaId}-${Date.now()}-${rand}`;
}

async function findEntrega(entregaId: number): Promise<EntregaInfo | null> {
  return prisma.entrega.findUnique({
    where: { id_entrega: entregaId },
    select: { id_entrega: true },
  });
}

async function validarEntrega(res: Response, entregaId: number) {
  if (!Number.isFinite(entregaId)) {
    res.status(400).json({ error: "ID de entrega inválido" });
    return null;
  }

  const entrega = await findEntrega(entregaId);
  if (!entrega) {
    res.status(404).json({ error: "Entrega no encontrada" });
    return null;
  }
  return entrega;
}

async function validarLimitesEvidencia(entregaId: number, tipo: TipoEvidenciaEntrega) {
  if (tipo === TipoEvidenciaEntrega.FIRMA) {
    const existing = await prisma.evidenciaEntrega.findFirst({
      where: { entregaId, tipo: TipoEvidenciaEntrega.FIRMA },
      select: { id: true },
    });
    if (existing) {
      return "La entrega ya tiene una firma registrada";
    }
    return null;
  }

  const fotos = await prisma.evidenciaEntrega.count({
    where: { entregaId, tipo: TipoEvidenciaEntrega.FOTO },
  });
  if (fotos >= MAX_FOTOS_POR_ENTREGA) {
    return `La entrega alcanzó el máximo de ${MAX_FOTOS_POR_ENTREGA} fotos`;
  }
  return null;
}

export const solicitarFirmaSubida = async (req: Request, res: Response) => {
  try {
    const entregaId = Number(req.params.id);
    const body = (req.body ?? {}) as EvidenceInput;
    const tipo = normalizeTipo(body.tipo);
    if (!tipo) {
      return res.status(400).json({ error: "tipo debe ser 'foto' o 'firma'" });
    }

    const formato = normalizeFormat(body.formato);
    const bytes = body.bytes !== undefined ? Number(body.bytes) : null;

    if (tipo === TipoEvidenciaEntrega.FOTO) {
      if (formato && !ALLOWED_FORMATS.has(formato)) {
        return res.status(400).json({ error: "Formato no permitido. Usa png o jpeg" });
      }
      if (bytes !== null) {
        if (!Number.isFinite(bytes) || bytes <= 0) {
          return res.status(400).json({ error: "bytes debe ser un numero positivo" });
        }
        if (bytes > MAX_BYTES) {
          return res.status(400).json({ error: "El archivo excede el tamano maximo permitido" });
        }
      }
    }

    const entrega = await validarEntrega(res, entregaId);
    if (!entrega) return;

    const limiteMsg = await validarLimitesEvidencia(entrega.id_entrega, tipo);
    if (limiteMsg) {
      return res.status(409).json({ error: limiteMsg });
    }

    if (tipo === TipoEvidenciaEntrega.FIRMA) {
      return res.json({
        requiresUpload: false,
        storage: "database",
        message: "Envia el vector de la firma en el endpoint de confirmacion",
      });
    }

    const folder = buildEntregaFolder(entrega.id_entrega);
    const publicId = buildPublicId(tipo, entrega.id_entrega);
    const signed = createUploadSignature({ folder, publicId });

    return res.json({
      ...signed,
      allowedFormats: Array.from(ALLOWED_FORMATS),
      maxBytes: MAX_BYTES,
      resourceType: "auto",
    });
  } catch (err) {
    console.error("Error al solicitar firma de subida:", err);
    return res.status(500).json({ error: "Error interno generando firma de subida" });
  }
};

export const confirmarEvidencia = async (req: Request, res: Response) => {
  try {
    const entregaId = Number(req.params.id);
    const body = (req.body ?? {}) as EvidenceInput;
    const tipo = normalizeTipo(body.tipo);
    const formato = normalizeFormat(body.formato);
    const bytes = body.bytes !== undefined ? Number(body.bytes) : NaN;
    const { url, publicId, vector } = body;

    if (!tipo) {
      return res.status(400).json({ error: "tipo es requerido (foto o firma)" });
    }

    if (tipo === TipoEvidenciaEntrega.FOTO) {
      if (!url || !publicId) {
        return res.status(400).json({ error: "url y publicId son obligatorios para las fotos" });
      }
      if (!formato || !ALLOWED_FORMATS.has(formato)) {
        return res.status(400).json({ error: "Formato no permitido. Usa png o jpeg" });
      }
      if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES) {
        return res.status(400).json({ error: "bytes es requerido y debe estar dentro del limite permitido" });
      }
    } else {
      const isEmptyString = typeof vector === 'string' && vector.trim() === '';
      if (vector === undefined || vector === null || isEmptyString) {
        return res.status(400).json({ error: "vector de firma es requerido" });
      }
    }

    const entrega = await validarEntrega(res, entregaId);
    if (!entrega) return;

    if (tipo === TipoEvidenciaEntrega.FOTO) {
      const folder = buildEntregaFolder(entrega.id_entrega);
      const expectedPrefix = `${folder}/`;
      if (!publicId || !publicId.startsWith(expectedPrefix)) {
        return res.status(400).json({ error: "publicId no pertenece al folder asignado para la entrega" });
      }
    }

    const limiteMsg = await validarLimitesEvidencia(entrega.id_entrega, tipo);
    if (limiteMsg) {
      return res.status(409).json({ error: limiteMsg });
    }

    const evidencia = await prisma.evidenciaEntrega.create({
      data: {
        entregaId: entrega.id_entrega,
        tipo,
        url: tipo === TipoEvidenciaEntrega.FOTO ? url : null,
        publicId: tipo === TipoEvidenciaEntrega.FOTO ? publicId : null,
        formato: tipo === TipoEvidenciaEntrega.FOTO ? formato : null,
        bytes: tipo === TipoEvidenciaEntrega.FOTO ? bytes : null,
        vector: tipo === TipoEvidenciaEntrega.FIRMA ? (vector as Prisma.InputJsonValue) : undefined,
      },
    });

    return res.status(201).json({ evidencia });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "Ya existe una evidencia registrada con ese publicId" });
      }
      if (err.code === "P2003") {
        return res.status(404).json({ error: "Entrega no encontrada o eliminada" });
      }
    }
    if (err instanceof Prisma.PrismaClientValidationError) {
      return res.status(400).json({ error: "Payload de evidencia invalido" });
    }

    console.error("Error al confirmar evidencia:", err);
    return res.status(500).json({ error: "Error interno al confirmar la evidencia" });
  }
};

export const listarEvidenciasPorEntrega = async (req: Request, res: Response) => {
  try {
    const entregaId = Number(req.params.id);
    const entrega = await validarEntrega(res, entregaId);
    if (!entrega) return;

    const evidencias = await prisma.evidenciaEntrega.findMany({
      where: { entregaId: entrega.id_entrega },
      orderBy: { creadoEn: "desc" },
    });

    return res.json({ evidencias });
  } catch (err) {
    console.error("Error al listar evidencias:", err);
    return res.status(500).json({ error: "Error interno al listar evidencias" });
  }
};
