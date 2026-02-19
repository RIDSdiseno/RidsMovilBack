"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerEntrega = exports.listarEntregas = exports.crearEntrega = void 0;
const client_1 = require("@prisma/client");
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
        const tecnicoId = req.user.id; // 👈 viene del authGuard
        const entregas = await prisma.entrega.findMany({
            where: {
                tecnicoId: tecnicoId, // 👈 FILTRO CLAVE
            },
            orderBy: {
                fecha: 'desc',
            },
            include: {
                evidencias: true,
            },
        });
        res.json({ entregas });
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
