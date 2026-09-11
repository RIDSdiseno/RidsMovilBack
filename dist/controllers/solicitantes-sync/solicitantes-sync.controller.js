"use strict";
// src/controllers/solicitantes-sync/solicitantes-sync.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sincronizarGoogleEmpresa = sincronizarGoogleEmpresa;
exports.sincronizarGoogleUsuario = sincronizarGoogleUsuario;
exports.sincronizarMicrosoftEmpresa = sincronizarMicrosoftEmpresa;
exports.sincronizarMicrosoftUsuario = sincronizarMicrosoftUsuario;
const intranet_sync_service_js_1 = require("../../services/intranet-sync.service.js");
/* =========================================================
   ERROR DE VALIDACIÓN
========================================================= */
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
        this.name = "ValidationError";
    }
}
/* =========================================================
   VALIDACIONES
========================================================= */
function validarEmpresaDominio(empresaId, domain) {
    const empresa = Number(empresaId);
    const dominio = String(domain ?? "")
        .trim()
        .toLowerCase();
    if (!Number.isInteger(empresa) ||
        empresa <= 0) {
        throw new ValidationError("empresaId inválido");
    }
    if (!dominio) {
        throw new ValidationError("domain es obligatorio");
    }
    return {
        empresaId: empresa,
        domain: dominio,
    };
}
function validarEmail(email) {
    const normalized = String(email ?? "")
        .trim()
        .toLowerCase();
    if (!normalized) {
        throw new ValidationError("email es obligatorio");
    }
    return normalized;
}
/* =========================================================
   RESPUESTA DE ERROR
========================================================= */
function responderError(res, error, fallbackMessage) {
    if (error instanceof
        intranet_sync_service_js_1.IntranetRequestError) {
        const status = error.status === 401 ||
            error.status === 403
            ? 502
            : error.status;
        return res
            .status(status)
            .json({
            ok: false,
            error: error.message,
        });
    }
    if (error instanceof
        ValidationError) {
        return res
            .status(error.status)
            .json({
            ok: false,
            error: error.message,
        });
    }
    return res
        .status(500)
        .json({
        ok: false,
        error: error instanceof Error
            ? error.message
            : fallbackMessage,
    });
}
/* =========================================================
   GOOGLE
========================================================= */
async function sincronizarGoogleEmpresa(req, res) {
    try {
        const params = validarEmpresaDominio(req.body?.empresaId, req.body?.domain);
        const result = await (0, intranet_sync_service_js_1.syncGoogleEmpresa)(params);
        return res.json(result);
    }
    catch (error) {
        console.error("[MOVIL sync Google]", error);
        return responderError(res, error, "Error sincronizando Google");
    }
}
async function sincronizarGoogleUsuario(req, res) {
    try {
        const params = validarEmpresaDominio(req.body?.empresaId, req.body?.domain);
        const email = validarEmail(req.body?.email);
        const result = await (0, intranet_sync_service_js_1.syncGoogleUsuario)({
            ...params,
            email,
        });
        return res.json(result);
    }
    catch (error) {
        console.error("[MOVIL sync Google usuario]", error);
        return responderError(res, error, "Error sincronizando usuario Google");
    }
}
/* =========================================================
   MICROSOFT
========================================================= */
async function sincronizarMicrosoftEmpresa(req, res) {
    try {
        const params = validarEmpresaDominio(req.body?.empresaId, req.body?.domain);
        const result = await (0, intranet_sync_service_js_1.syncMicrosoftEmpresa)(params);
        return res.json(result);
    }
    catch (error) {
        console.error("[MOVIL sync Microsoft]", error);
        return responderError(res, error, "Error sincronizando Microsoft");
    }
}
async function sincronizarMicrosoftUsuario(req, res) {
    try {
        const params = validarEmpresaDominio(req.body?.empresaId, req.body?.domain);
        const email = validarEmail(req.body?.email);
        const result = await (0, intranet_sync_service_js_1.syncMicrosoftUsuario)({
            ...params,
            email,
        });
        return res.json(result);
    }
    catch (error) {
        console.error("[MOVIL sync Microsoft usuario]", error);
        return responderError(res, error, "Error sincronizando usuario Microsoft");
    }
}
