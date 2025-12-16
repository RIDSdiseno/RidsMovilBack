"use strict";
// src/routes/evidencia.route.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middlewares/auth.middleware.js");
const evidencias_controller_js_1 = require("../controllers/evidencias.controller.js");
const r = (0, express_1.Router)({ mergeParams: true });
r.use(auth_middleware_js_1.authGuard);
r.post("/firma", evidencias_controller_js_1.solicitarFirmaSubida);
r.post("/confirmar", evidencias_controller_js_1.confirmarEvidencia);
r.get("/", evidencias_controller_js_1.listarEvidenciasPorEntrega);
exports.default = r;
