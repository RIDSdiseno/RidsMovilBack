"use strict";
// src/controllers/evidencias.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarEvidenciasPorEntrega = exports.confirmarEvidencia = exports.solicitarFirmaSubida = void 0;
const client_1 = require("@prisma/client");
const cloudinary_js_1 = require("../config/cloudinary.js");
const prisma = new client_1.PrismaClient();
const ALLOWED_IMAGE_FORMATS = new Set(["png", "jpg", "jpeg"]);
const ALLOWED_PDF_FORMATS = new Set(["pdf"]);
const ALLOWED_FORMATS = new Set([...ALLOWED_IMAGE_FORMATS, ...ALLOWED_PDF_FORMATS]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FOTOS_POR_ENTREGA = 10;
function normalizeTipo(tipo) {
    const val = (tipo || "").toString().trim().toLowerCase();
    if (val === "foto" || val === "image" || val === "foto_producto" || val === "foto_equipo") {
        return client_1.TipoEvidenciaEntrega.FOTO;
    }
    if (val === "firma" || val === "signature") {
        return client_1.TipoEvidenciaEntrega.FIRMA;
    }
    if (val === "pdf" || val === "documento" || val === "comprobante") {
        return client_1.TipoEvidenciaEntrega.PDF;
    }
    return null;
}
function normalizeFormat(format) {
    const raw = (format || "").toString().trim().toLowerCase();
    if (!raw)
        return null;
    if (raw.includes("/")) {
        return raw.split("/").pop() || null;
    }
    if (raw.startsWith("."))
        return raw.slice(1);
    return raw;
}
function sanitizePublicIdName(value) {
    const cleaned = (value || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || null;
}
function buildPublicId(tipo, entregaId, nombreArchivo) {
    if (tipo === client_1.TipoEvidenciaEntrega.PDF) {
        const sanitized = sanitizePublicIdName(nombreArchivo);
        if (sanitized) {
            return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
        }
    }
    const prefix = tipo === client_1.TipoEvidenciaEntrega.FIRMA
        ? "firma"
        : tipo === client_1.TipoEvidenciaEntrega.PDF
            ? "pdf"
            : "foto";
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${entregaId}-${Date.now()}-${rand}`;
}
async function findEntrega(entregaId) {
    return prisma.entrega.findUnique({
        where: { id_entrega: entregaId },
        select: { id_entrega: true },
    });
}
async function validarEntrega(res, entregaId) {
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
async function validarLimitesEvidencia(entregaId, tipo) {
    if (tipo === client_1.TipoEvidenciaEntrega.FIRMA || tipo === client_1.TipoEvidenciaEntrega.PDF) {
        const existing = await prisma.evidenciaEntrega.findFirst({
            where: { entregaId, tipo },
            select: { id: true },
        });
        if (existing) {
            return tipo === client_1.TipoEvidenciaEntrega.FIRMA
                ? "La entrega ya tiene una firma registrada"
                : "La entrega ya tiene un PDF registrado";
        }
        return null;
    }
    const fotos = await prisma.evidenciaEntrega.count({
        where: { entregaId, tipo: client_1.TipoEvidenciaEntrega.FOTO },
    });
    if (fotos >= MAX_FOTOS_POR_ENTREGA) {
        return `La entrega alcanzó el máximo de ${MAX_FOTOS_POR_ENTREGA} fotos`;
    }
    return null;
}
const solicitarFirmaSubida = async (req, res) => {
    try {
        const entregaId = Number(req.params.id);
        const body = (req.body ?? {});
        const tipo = normalizeTipo(body.tipo);
        const formato = normalizeFormat(body.formato);
        const bytes = body.bytes !== undefined ? Number(body.bytes) : null;
        if (!tipo) {
            return res.status(400).json({ error: "tipo debe ser 'foto', 'firma' o 'pdf'" });
        }
        if (formato && !ALLOWED_FORMATS.has(formato)) {
            return res.status(400).json({ error: "Formato no permitido. Usa png, jpeg o pdf" });
        }
        if (tipo === client_1.TipoEvidenciaEntrega.PDF && formato && !ALLOWED_PDF_FORMATS.has(formato)) {
            return res.status(400).json({ error: "El comprobante debe ser PDF" });
        }
        if (tipo !== client_1.TipoEvidenciaEntrega.PDF && formato && !ALLOWED_IMAGE_FORMATS.has(formato)) {
            return res.status(400).json({ error: "La evidencia debe ser imagen png o jpeg" });
        }
        if (bytes !== null) {
            if (!Number.isFinite(bytes) || bytes <= 0) {
                return res.status(400).json({ error: "bytes debe ser un numero positivo" });
            }
            if (bytes > MAX_BYTES) {
                return res.status(400).json({ error: "El archivo excede el tamano maximo permitido" });
            }
        }
        const entrega = await validarEntrega(res, entregaId);
        if (!entrega)
            return;
        const limiteMsg = await validarLimitesEvidencia(entrega.id_entrega, tipo);
        if (limiteMsg) {
            return res.status(409).json({ error: limiteMsg });
        }
        const folder = (0, cloudinary_js_1.buildEntregaFolder)(entrega.id_entrega);
        const publicId = buildPublicId(tipo, entrega.id_entrega, body.nombreArchivo);
        const signed = (0, cloudinary_js_1.createUploadSignature)({ folder, publicId });
        const resourceType = tipo === client_1.TipoEvidenciaEntrega.PDF ? "raw" : "image";
        return res.json({
            ...signed,
            allowedFormats: Array.from(ALLOWED_FORMATS),
            maxBytes: MAX_BYTES,
            uploadUrl: signed.uploadUrl?.replace("/auto/upload", `/${resourceType}/upload`),
            resourceType,
            tipo,
        });
    }
    catch (err) {
        console.error("Error al solicitar firma de subida:", err);
        return res.status(500).json({ error: "Error interno generando firma de subida" });
    }
};
exports.solicitarFirmaSubida = solicitarFirmaSubida;
const confirmarEvidencia = async (req, res) => {
    try {
        const entregaId = Number(req.params.id);
        const body = (req.body ?? {});
        const tipo = normalizeTipo(body.tipo);
        const formato = normalizeFormat(body.formato);
        const bytes = body.bytes !== undefined ? Number(body.bytes) : NaN;
        const { url, publicId } = body;
        if (!tipo) {
            return res.status(400).json({ error: "tipo es requerido (foto, firma o pdf)" });
        }
        if (!url || !publicId) {
            return res.status(400).json({ error: "url y publicId son obligatorios" });
        }
        if (!formato || !ALLOWED_FORMATS.has(formato)) {
            return res.status(400).json({ error: "Formato no permitido. Usa png, jpeg o pdf" });
        }
        if (tipo === client_1.TipoEvidenciaEntrega.PDF && !ALLOWED_PDF_FORMATS.has(formato)) {
            return res.status(400).json({ error: "El comprobante debe ser PDF" });
        }
        if (tipo !== client_1.TipoEvidenciaEntrega.PDF && !ALLOWED_IMAGE_FORMATS.has(formato)) {
            return res.status(400).json({ error: "La evidencia debe ser imagen png o jpeg" });
        }
        if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES) {
            return res.status(400).json({ error: "bytes es requerido y debe estar dentro del limite permitido" });
        }
        const entrega = await validarEntrega(res, entregaId);
        if (!entrega)
            return;
        const folder = (0, cloudinary_js_1.buildEntregaFolder)(entrega.id_entrega);
        const expectedPrefix = `${folder}/`;
        if (!publicId || !publicId.startsWith(expectedPrefix)) {
            return res.status(400).json({ error: "publicId no pertenece al folder asignado para la entrega" });
        }
        const limiteMsg = await validarLimitesEvidencia(entrega.id_entrega, tipo);
        if (limiteMsg) {
            return res.status(409).json({ error: limiteMsg });
        }
        const evidencia = await prisma.evidenciaEntrega.create({
            data: {
                entregaId: entrega.id_entrega,
                tipo,
                url: url,
                publicId: publicId,
                formato: formato,
                bytes: bytes,
            },
        });
        return res.status(201).json({ evidencia });
    }
    catch (err) {
        if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (err.code === "P2002") {
                return res.status(409).json({ error: "Ya existe una evidencia registrada con ese publicId" });
            }
            if (err.code === "P2003") {
                return res.status(404).json({ error: "Entrega no encontrada o eliminada" });
            }
        }
        if (err instanceof client_1.Prisma.PrismaClientValidationError) {
            return res.status(400).json({ error: "Payload de evidencia invalido" });
        }
        console.error("Error al confirmar evidencia:", err);
        return res.status(500).json({ error: "Error interno al confirmar la evidencia" });
    }
};
exports.confirmarEvidencia = confirmarEvidencia;
const listarEvidenciasPorEntrega = async (req, res) => {
    try {
        const entregaId = Number(req.params.id);
        const entrega = await validarEntrega(res, entregaId);
        if (!entrega)
            return;
        const evidencias = await prisma.evidenciaEntrega.findMany({
            where: { entregaId: entrega.id_entrega },
            orderBy: { creadoEn: "desc" },
        });
        return res.json({ evidencias });
    }
    catch (err) {
        console.error("Error al listar evidencias:", err);
        return res.status(500).json({ error: "Error interno al listar evidencias" });
    }
};
exports.listarEvidenciasPorEntrega = listarEvidenciasPorEntrega;
