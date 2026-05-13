"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarPdfEntrega = exports.obtenerEntrega = exports.listarEntregas = exports.crearEntrega = void 0;
const client_1 = require("@prisma/client");
const microsoft_mail_service_js_1 = require("../services/microsoft-mail.service.js");
const prisma = new client_1.PrismaClient();
/* =========================
   CREAR ENTREGA
========================= */
const crearEntrega = async (req, res) => {
    try {
        const tecnicoId = req.user?.id;
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
    }
    catch (err) {
        console.error("Error al crear entrega:", err);
        return res.status(500).json({ error: "Error interno al crear la entrega" });
    }
};
exports.crearEntrega = crearEntrega;
/* =========================
   HISTORIAL DEL TÉCNICO
========================= */
const listarEntregas = async (req, res) => {
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al listar entregas' });
    }
};
exports.listarEntregas = listarEntregas;
/* =========================
   OBTENER ENTREGA POR ID
========================= */
const obtenerEntrega = async (req, res) => {
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
    }
    catch (err) {
        console.error("Error al obtener entrega:", err);
        return res.status(500).json({ error: "Error interno al obtener la entrega" });
    }
};
exports.obtenerEntrega = obtenerEntrega;
/* =========================
   ENVIAR PDF POR CORREO
========================= */
const enviarPdfEntrega = async (req, res) => {
    try {
        const tecnicoId = req.user?.id;
        const tecnicoEmail = req.user?.email;
        const tecnicoNombre = req.user?.nombre;
        const entregaId = Number(req.params.id);
        const receptorEmail = String(req.body?.receptorEmail || "").trim().toLowerCase();
        if (!tecnicoId || !tecnicoEmail) {
            return res.status(401).json({ error: "Técnico no autenticado" });
        }
        if (!Number.isFinite(entregaId)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receptorEmail)) {
            return res.status(400).json({ error: "Correo del receptor inválido" });
        }
        const entrega = await prisma.entrega.findFirst({
            where: { id_entrega: entregaId, tecnicoId },
            include: {
                evidencias: {
                    where: { tipo: client_1.TipoEvidenciaEntrega.PDF },
                    orderBy: { creadoEn: "desc" },
                    take: 1,
                },
            },
        });
        if (!entrega) {
            return res.status(404).json({ error: "Entrega no encontrada" });
        }
        const pdf = entrega.evidencias[0];
        if (!pdf) {
            return res.status(404).json({ error: "La entrega no tiene PDF registrado" });
        }
        const publicIdName = pdf.publicId.split("/").pop() || `entrega-${entrega.id_entrega}.pdf`;
        const pdfFileName = publicIdName.toLowerCase().endsWith(".pdf")
            ? publicIdName
            : `${publicIdName}.pdf`;
        await (0, microsoft_mail_service_js_1.sendDeliveryPdfEmail)({
            ccEmail: tecnicoEmail,
            companyName: entrega.empresaNombre,
            pdfFileName,
            pdfUrl: pdf.url,
            recipientEmail: receptorEmail,
            recipientName: entrega.receptorNombre,
            senderName: tecnicoNombre || tecnicoEmail,
        });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("Error al enviar PDF de entrega:", err);
        const message = err instanceof Error ? err.message : "Error interno al enviar el correo";
        return res.status(500).json({ error: message });
    }
};
exports.enviarPdfEntrega = enviarPdfEntrega;
