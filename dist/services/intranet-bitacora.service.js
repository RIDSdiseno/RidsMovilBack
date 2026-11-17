"use strict";
// src/services/intranet-bitacora.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntranetBitacoraError = void 0;
exports.intranetBitacoraRequest = intranetBitacoraRequest;
exports.intranetBitacoraMultipartRequest = intranetBitacoraMultipartRequest;
function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} no está configurada`);
    }
    return value
        .trim()
        .replace(/\/+$/, "");
}
const INTRANET_API_URL = getRequiredEnv("INTRANET_API_URL");
const INTRANET_INTERNAL_API_KEY = getRequiredEnv("INTRANET_INTERNAL_API_KEY");
/* =========================================================
   ERROR PERSONALIZADO
========================================================= */
class IntranetBitacoraError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name =
            "IntranetBitacoraError";
        this.status =
            status;
        this.data =
            data;
    }
}
exports.IntranetBitacoraError = IntranetBitacoraError;
/* =========================================================
   HELPERS
========================================================= */
function construirQuery(query) {
    if (!query) {
        return "";
    }
    const params = new URLSearchParams();
    for (const [key, value,] of Object.entries(query)) {
        if (value ===
            undefined ||
            value ===
                null ||
            value ===
                "") {
            continue;
        }
        /*
         * tecnicoId nunca se acepta
         * desde el cliente móvil.
         *
         * Intranet lo fuerza utilizando
         * x-mobile-tecnico-id.
         */
        if (key ===
            "tecnicoId") {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                params.append(key, String(item));
            }
            continue;
        }
        params.set(key, String(value));
    }
    const text = params.toString();
    return text
        ? `?${text}`
        : "";
}
async function parseRespuesta(response) {
    const text = await response.text();
    if (!text) {
        return null;
    }
    const contentType = response.headers.get("content-type") ??
        "";
    if (!contentType.includes("application/json")) {
        throw new IntranetBitacoraError(`La Intranet no respondió JSON (${response.status})`, response.status, text);
    }
    try {
        return JSON.parse(text);
    }
    catch {
        throw new IntranetBitacoraError(`La Intranet devolvió JSON inválido (${response.status})`, response.status, text);
    }
}
/* =========================================================
   REQUEST JSON
========================================================= */
async function intranetBitacoraRequest(path, options) {
    const query = construirQuery(options.query);
    const endpoint = `${INTRANET_API_URL}/internal/mobile/bitacora${path}${query}`;
    console.log("[BITACORA][INTRANET ENDPOINT]", endpoint);
    let response;
    try {
        response =
            await fetch(endpoint, {
                method: options.method ??
                    "GET",
                headers: {
                    "x-internal-api-key": INTRANET_INTERNAL_API_KEY,
                    "x-mobile-tecnico-id": String(options.tecnicoId),
                    ...(options.body !==
                        undefined
                        ? {
                            "Content-Type": "application/json",
                        }
                        : {}),
                },
                body: options.body !==
                    undefined
                    ? JSON.stringify(options.body)
                    : undefined,
            });
    }
    catch (error) {
        console.error("[BITACORA][INTRANET FETCH ERROR]", {
            endpoint,
            error,
        });
        throw new IntranetBitacoraError("No fue posible conectar con la Intranet", 502);
    }
    const data = await parseRespuesta(response);
    if (!response.ok) {
        const message = data?.error ??
            data?.message ??
            `Error Intranet (${response.status})`;
        throw new IntranetBitacoraError(message, response.status, data);
    }
    return data;
}
/* =========================================================
   REQUEST MULTIPART
========================================================= */
async function intranetBitacoraMultipartRequest({ path, tecnicoId, file, fields, }) {
    const endpoint = `${INTRANET_API_URL}/internal/mobile/bitacora${path}`;
    const formData = new FormData();
    for (const [key, value,] of Object.entries(fields)) {
        if (value ===
            undefined ||
            value ===
                null) {
            continue;
        }
        formData.append(key, value);
    }
    const blob = new Blob([
        new Uint8Array(file.buffer),
    ], {
        type: file.mimetype,
    });
    formData.append("file", blob, file.originalname);
    let response;
    try {
        response =
            await fetch(endpoint, {
                method: "POST",
                headers: {
                    "x-internal-api-key": INTRANET_INTERNAL_API_KEY,
                    "x-mobile-tecnico-id": String(tecnicoId),
                },
                /*
                 * NO agregar Content-Type manual.
                 * fetch genera el boundary.
                 */
                body: formData,
            });
    }
    catch (error) {
        console.error("[BITACORA][INTRANET MULTIPART ERROR]", {
            endpoint,
            error,
        });
        throw new IntranetBitacoraError("No fue posible enviar la evidencia a la Intranet", 502);
    }
    const data = await parseRespuesta(response);
    if (!response.ok) {
        throw new IntranetBitacoraError(data?.error ??
            data?.message ??
            `Error Intranet (${response.status})`, response.status, data);
    }
    return data;
}
