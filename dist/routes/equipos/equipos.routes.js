"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const equipos_controller_js_1 = require("../../controllers/equipos/equipos.controller.js");
const auth_middleware_js_1 = require("../../middlewares/auth.middleware.js");
const r = (0, express_1.Router)();
/* =========================================================
   EQUIPOS
========================================================= */
// Listado de equipos
r.get("/getAllEquipos", auth_middleware_js_1.authGuard, equipos_controller_js_1.getAllEquipos);
// Detalle de un equipo
r.get("/equipos/:id", auth_middleware_js_1.authGuard, equipos_controller_js_1.getEquipoDetalleMovil);
// Actualizar información del equipo
r.patch("/equipos/:id", auth_middleware_js_1.authGuard, equipos_controller_js_1.actualizarEquipo);
// Cambiar solicitante asociado
r.put("/equipos/:id/asignacion", auth_middleware_js_1.authGuard, equipos_controller_js_1.cambiarAsignacionEquipo);
// Crear equipo
r.post("/createEquipo", auth_middleware_js_1.authGuard, equipos_controller_js_1.createEquipo);
// Carga masiva de equipos
r.post("/createManyEquipos", auth_middleware_js_1.authGuard, equipos_controller_js_1.createManyEquipos);
// Carga masiva de detalles
r.post("/createManyDetalle", auth_middleware_js_1.authGuard, equipos_controller_js_1.createManyDetalle);
exports.default = r;
