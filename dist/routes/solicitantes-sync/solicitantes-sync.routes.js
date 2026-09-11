"use strict";
// src/routes/solicitantes-sync/solicitantes-sync.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const solicitantes_sync_controller_1 = require("../../controllers/solicitantes-sync/solicitantes-sync.controller");
const auth_middleware_js_1 = require("../../middlewares/auth.middleware.js");
const r = (0, express_1.Router)();
r.post("/google", auth_middleware_js_1.authGuard, solicitantes_sync_controller_1.sincronizarGoogleEmpresa);
r.put("/google", auth_middleware_js_1.authGuard, solicitantes_sync_controller_1.sincronizarGoogleUsuario);
r.post("/microsoft", auth_middleware_js_1.authGuard, solicitantes_sync_controller_1.sincronizarMicrosoftEmpresa);
r.put("/microsoft", auth_middleware_js_1.authGuard, solicitantes_sync_controller_1.sincronizarMicrosoftUsuario);
exports.default = r;
