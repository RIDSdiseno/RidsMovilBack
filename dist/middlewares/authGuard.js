"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authGuardOptional = exports.authGuard = void 0;
const jwt_js_1 = require("../lib/jwt.js");
/**
 * Middleware que exige Access Token en Authorization: Bearer <token>
 * Valida firma/expiración y coloca el payload en req.user
 */
const authGuard = (req, res, next) => {
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Sin token de acceso" });
    }
    const token = h.slice(7);
    try {
        const payload = (0, jwt_js_1.verifyAccessToken)(token);
        req.user = payload;
        req.token = token;
        return next();
    }
    catch {
        return res.status(401).json({ error: "Token inválido o expirado" });
    }
};
exports.authGuard = authGuard;
/**
 * Variante opcional: deja pasar sin token, pero si existe y es válido, rellena req.user.
 * Útil para endpoints públicos con info adicional si el usuario está logueado.
 */
const authGuardOptional = (req, _res, next) => {
    const h = req.headers.authorization;
    if (h && h.startsWith("Bearer ")) {
        const token = h.slice(7);
        try {
            const payload = (0, jwt_js_1.verifyAccessToken)(token);
            req.user = payload;
            req.token = token;
        }
        catch {
            // ignoramos errores, sigue como anónimo
        }
    }
    return next();
};
exports.authGuardOptional = authGuardOptional;
exports.default = exports.authGuard;
