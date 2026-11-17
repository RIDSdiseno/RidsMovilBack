"use strict";
// src/services/intranet-taller.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntranetTallerError = void 0;
exports.crearIngresoTallerIntranet = crearIngresoTallerIntranet;
function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} no está configurada`);
    }
    return value;
}
class IntranetTallerError extends Error {
    constructor(message, status) {
        super(message);
        this.name =
            "IntranetTallerError";
        this.status =
            status;
    }
}
exports.IntranetTallerError = IntranetTallerError;
const INTRANET_API_URL = getRequiredEnv("INTRANET_API_URL");
const INTRANET_INTERNAL_API_KEY = getRequiredEnv("INTRANET_INTERNAL_API_KEY");
async function crearIngresoTallerIntranet(payload) {
    const response = await fetch(`${INTRANET_API_URL}/internal/mobile/taller/ingresos`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-internal-api-key": INTRANET_INTERNAL_API_KEY,
        },
        body: JSON.stringify(payload),
    });
    const data = await response
        .json()
        .catch(() => null);
    if (!response.ok) {
        throw new IntranetTallerError(data?.error ??
            data?.message ??
            `Error Intranet ${response.status}`, response.status);
    }
    return data;
}
