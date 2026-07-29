"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    console.error('[ERROR]', err);
    const status = err.status || 500;
    // Errores de cliente (4xx) sí muestran el mensaje; los 5xx no exponen
    // detalles internos en la respuesta (solo se loguean arriba).
    const isClientError = status >= 400 && status < 500;
    res.status(status).json({
        ok: false,
        message: isClientError ? (err.message || 'Solicitud inválida') : 'Error interno del servidor',
        ...(isClientError && err.details ? { details: err.details } : {}),
    });
}
