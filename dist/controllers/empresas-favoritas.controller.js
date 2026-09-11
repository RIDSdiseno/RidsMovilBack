"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerEmpresasFavoritas = obtenerEmpresasFavoritas;
exports.agregarEmpresaFavorita = agregarEmpresaFavorita;
exports.eliminarEmpresaFavorita = eliminarEmpresaFavorita;
const prisma_js_1 = require("../lib/prisma.js");
const ORIGENES_PERMITIDOS = new Set(["RIDS", "ECONNET"]);
function parseFavoritoParams(req) {
    const tecnicoId = req.user?.id;
    const empresaId = Number(req.params.empresaId);
    const origen = String(req.params.origen ?? "").trim().toUpperCase();
    if (!tecnicoId) {
        return { error: "No se encontró el técnico autenticado.", ok: false, status: 401 };
    }
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
        return { error: "El identificador de empresa no es válido.", ok: false, status: 400 };
    }
    if (!ORIGENES_PERMITIDOS.has(origen)) {
        return { error: "El origen de la empresa no es válido.", ok: false, status: 400 };
    }
    return { tecnicoId, empresaId, ok: true, origen };
}
async function obtenerEmpresasFavoritas(req, res) {
    const tecnicoId = req.user?.id;
    if (!tecnicoId) {
        return res.status(401).json({ error: "No se encontró el técnico autenticado." });
    }
    try {
        const favoritos = await prisma_js_1.prisma.empresaFavoritaTecnico.findMany({
            where: { tecnicoId },
            orderBy: [{ origen: "asc" }, { createdAt: "asc" }],
            select: { empresaId: true, origen: true },
        });
        return res.json({ favoritos });
    }
    catch (error) {
        console.error("Error al obtener empresas favoritas:", error);
        return res.status(500).json({ error: "No se pudieron obtener las empresas favoritas." });
    }
}
async function agregarEmpresaFavorita(req, res) {
    const params = parseFavoritoParams(req);
    if (!params.ok)
        return res.status(params.status).json({ error: params.error });
    try {
        const tecnico = await prisma_js_1.prisma.tecnico.findUnique({
            where: { id_tecnico: params.tecnicoId },
            select: { id_tecnico: true },
        });
        if (!tecnico) {
            return res.status(404).json({ error: "El técnico autenticado no existe." });
        }
        const favorito = await prisma_js_1.prisma.empresaFavoritaTecnico.upsert({
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
    }
    catch (error) {
        console.error("Error al agregar empresa favorita:", error);
        return res.status(500).json({ error: "No se pudo guardar la empresa favorita." });
    }
}
async function eliminarEmpresaFavorita(req, res) {
    const params = parseFavoritoParams(req);
    if (!params.ok)
        return res.status(params.status).json({ error: params.error });
    try {
        await prisma_js_1.prisma.empresaFavoritaTecnico.deleteMany({
            where: {
                tecnicoId: params.tecnicoId,
                origen: params.origen,
                empresaId: params.empresaId,
            },
        });
        return res.json({ ok: true });
    }
    catch (error) {
        console.error("Error al eliminar empresa favorita:", error);
        return res.status(500).json({ error: "No se pudo eliminar la empresa favorita." });
    }
}
