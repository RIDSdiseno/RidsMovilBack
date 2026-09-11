"use strict";
// src/services/intranet-sync.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntranetRequestError = void 0;
exports.syncGoogleEmpresa = syncGoogleEmpresa;
exports.syncGoogleUsuario = syncGoogleUsuario;
exports.syncMicrosoftEmpresa = syncMicrosoftEmpresa;
exports.syncMicrosoftUsuario = syncMicrosoftUsuario;
function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} no está configurada`);
    }
    return value;
}
class IntranetRequestError extends Error {
    constructor(message, status) {
        super(message);
        this.name =
            "IntranetRequestError";
        this.status =
            status;
    }
}
exports.IntranetRequestError = IntranetRequestError;
const INTRANET_API_URL = getRequiredEnv("INTRANET_API_URL");
const INTRANET_INTERNAL_API_KEY = getRequiredEnv("INTRANET_INTERNAL_API_KEY");
async function intranetRequest(path, options) {
    const response = await fetch(`${INTRANET_API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "x-internal-api-key": INTRANET_INTERNAL_API_KEY,
            ...(options.headers ?? {}),
        },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new IntranetRequestError(data?.error ??
            data?.message ??
            `Error intranet ${response.status}`, response.status);
    }
    return data;
}
/* =========================================================
   GOOGLE
========================================================= */
async function syncGoogleEmpresa(params) {
    return intranetRequest("/sync/google/users", {
        method: "POST",
        body: JSON.stringify({
            empresaId: params.empresaId,
            domain: params.domain
                .trim()
                .toLowerCase(),
        }),
    });
}
async function syncGoogleUsuario(params) {
    return intranetRequest("/sync/google/users", {
        method: "PUT",
        body: JSON.stringify({
            empresaId: params.empresaId,
            domain: params.domain
                .trim()
                .toLowerCase(),
            email: params.email
                .trim()
                .toLowerCase(),
        }),
    });
}
/* =========================================================
   MICROSOFT
========================================================= */
async function syncMicrosoftEmpresa(params) {
    return intranetRequest("/sync/microsoft/users", {
        method: "POST",
        body: JSON.stringify({
            empresaId: params.empresaId,
            domain: params.domain
                .trim()
                .toLowerCase(),
        }),
    });
}
async function syncMicrosoftUsuario(params) {
    return intranetRequest("/sync/microsoft/users", {
        method: "PUT",
        body: JSON.stringify({
            empresaId: params.empresaId,
            domain: params.domain
                .trim()
                .toLowerCase(),
            email: params.email
                .trim()
                .toLowerCase(),
        }),
    });
}
