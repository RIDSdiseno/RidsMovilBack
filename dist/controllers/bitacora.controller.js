"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarBitacoras = listarBitacoras;
exports.crearBitacora = crearBitacora;
exports.obtenerBitacora = obtenerBitacora;
exports.actualizarBitacora = actualizarBitacora;
exports.eliminarBitacora = eliminarBitacora;
exports.actualizarRecordatorio = actualizarRecordatorio;
exports.obtenerOpcionesRelacion = obtenerOpcionesRelacion;
exports.obtenerEtapas = obtenerEtapas;
exports.actualizarEtapa = actualizarEtapa;
exports.completarEtapa = completarEtapa;
exports.solicitarRevision = solicitarRevision;
exports.responderRevision = responderRevision;
exports.obtenerEvidencias = obtenerEvidencias;
exports.agregarEvidencia = agregarEvidencia;
exports.eliminarEvidencia = eliminarEvidencia;
exports.listarRevisores = listarRevisores;
exports.obtenerPermisosBitacora = obtenerPermisosBitacora;
exports.listarEmpresasBitacora = listarEmpresasBitacora;
const intranet_bitacora_service_js_1 = require("../services/intranet-bitacora.service.js");
function obtenerTecnicoId(req) {
    const user = req.user;
    const tecnicoId = Number(user?.id_tecnico ??
        user?.tecnicoId ??
        user?.id ??
        user?.userId);
    if (!Number.isInteger(tecnicoId) ||
        tecnicoId <= 0) {
        throw new intranet_bitacora_service_js_1.IntranetBitacoraError("No fue posible identificar al técnico autenticado", 401);
    }
    return tecnicoId;
}
function validarId(value, nombre) {
    const id = Number(value);
    if (!Number.isInteger(id) ||
        id <= 0) {
        throw new intranet_bitacora_service_js_1.IntranetBitacoraError(`${nombre} inválido`, 400);
    }
    return id;
}
function responderError(res, error, fallback) {
    if (error instanceof
        intranet_bitacora_service_js_1.IntranetBitacoraError) {
        return res
            .status(error.status)
            .json({
            error: error.message,
        });
    }
    console.error("[BITACORA][ERROR]", error);
    return res
        .status(500)
        .json({
        error: fallback,
    });
}
/* =========================================================
   BITÁCORA
========================================================= */
async function listarBitacoras(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)("/", {
            tecnicoId,
            query: req.query,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error al obtener las bitácoras");
    }
}
async function crearBitacora(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        /*
         * Nunca confiar en tecnicoId
         * recibido desde Expo.
         */
        const { tecnicoId: _tecnicoIdIgnorado, ...body } = req.body ??
            {};
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)("/", {
            method: "POST",
            tecnicoId,
            body,
        });
        return res
            .status(201)
            .json(data);
    }
    catch (error) {
        return responderError(res, error, "Error al crear la bitácora");
    }
}
async function obtenerBitacora(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}`, {
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error al obtener la bitácora");
    }
}
async function actualizarBitacora(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const { tecnicoId: _tecnicoIdIgnorado, ...body } = req.body ??
            {};
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}`, {
            method: "PATCH",
            tecnicoId,
            body,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error al actualizar la bitácora");
    }
}
async function eliminarBitacora(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}`, {
            method: "DELETE",
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error al eliminar la bitácora");
    }
}
async function actualizarRecordatorio(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/recordatorio`, {
            method: "PATCH",
            tecnicoId,
            body: req.body,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error actualizando el recordatorio");
    }
}
/* =========================================================
   OPCIONES RELACIONADAS
========================================================= */
async function obtenerOpcionesRelacion(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)("/opciones-relacion", {
            tecnicoId,
            query: req.query,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error obteniendo opciones relacionadas");
    }
}
/* =========================================================
   ETAPAS
========================================================= */
async function obtenerEtapas(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/etapas`, {
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error obteniendo las etapas");
    }
}
async function actualizarEtapa(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const etapaId = validarId(req.params.etapaId, "ID de etapa");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/etapas/${etapaId}`, {
            method: "PATCH",
            tecnicoId,
            body: req.body,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error actualizando la etapa");
    }
}
async function completarEtapa(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const etapaId = validarId(req.params.etapaId, "ID de etapa");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/etapas/${etapaId}/completar`, {
            method: "POST",
            tecnicoId,
            body: req.body ??
                {},
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error completando la etapa");
    }
}
async function solicitarRevision(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const etapaId = validarId(req.params.etapaId, "ID de etapa");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/etapas/${etapaId}/solicitar-revision`, {
            method: "POST",
            tecnicoId,
            body: req.body,
        });
        return res
            .status(201)
            .json(data);
    }
    catch (error) {
        return responderError(res, error, "Error solicitando la revisión");
    }
}
async function responderRevision(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const etapaId = validarId(req.params.etapaId, "ID de etapa");
        const aprobacionId = validarId(req.params.aprobacionId, "ID de aprobación");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/etapas/${etapaId}/aprobaciones/${aprobacionId}/responder`, {
            method: "POST",
            tecnicoId,
            body: req.body,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error respondiendo la revisión");
    }
}
/* =========================================================
   EVIDENCIAS
========================================================= */
async function obtenerEvidencias(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/evidencias`, {
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error obteniendo evidencias");
    }
}
async function agregarEvidencia(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        if (!req.file) {
            return res
                .status(400)
                .json({
                error: "Debes adjuntar una imagen o video",
            });
        }
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraMultipartRequest)({
            path: `/${id}/evidencias`,
            tecnicoId,
            file: req.file,
            fields: {
                etapa: typeof req.body.etapa ===
                    "string"
                    ? req.body.etapa
                    : undefined,
                descripcion: typeof req.body.descripcion ===
                    "string"
                    ? req.body.descripcion
                    : undefined,
            },
        });
        return res
            .status(201)
            .json(data);
    }
    catch (error) {
        return responderError(res, error, "Error agregando la evidencia");
    }
}
async function eliminarEvidencia(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const evidenciaId = validarId(req.params.evidenciaId, "ID de evidencia");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/evidencias/${evidenciaId}`, {
            method: "DELETE",
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error eliminando la evidencia");
    }
}
async function listarRevisores(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)("/revisores", {
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error obteniendo técnicos revisores");
    }
}
async function obtenerPermisosBitacora(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const id = validarId(req.params.id, "ID de bitácora");
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)(`/${id}/permisos`, {
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error obteniendo permisos de la bitácora");
    }
}
async function listarEmpresasBitacora(req, res) {
    try {
        const tecnicoId = obtenerTecnicoId(req);
        const data = await (0, intranet_bitacora_service_js_1.intranetBitacoraRequest)("/empresas", {
            tecnicoId,
        });
        return res.json(data);
    }
    catch (error) {
        return responderError(res, error, "Error obteniendo empresas");
    }
}
