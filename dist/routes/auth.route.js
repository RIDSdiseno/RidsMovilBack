"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const r = (0, express_1.Router)();
r.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));
//Auth
r.post("/register", auth_controller_1.registerUser);
r.post("/login", auth_controller_1.login);
r.post("/logout", auth_controller_1.logout);
r.post("/refresh", auth_controller_1.refresh);
r.get("/usuarios", auth_controller_1.getAllUsers);
r.get("/clientes", auth_controller_1.getAllClientes);
r.delete("/deletecliente/:id", auth_controller_1.deleteCliente);
r.get("/historial/:id", auth_middleware_1.authGuard, auth_controller_1.obtenerHistorialPorTecnico);
//para cargar "masivamente" las empresas
r.post("/carga", auth_controller_1.createManyempresa);
r.post("/createcliente", auth_controller_1.createCliente);
r.post("/crearsolicitante", auth_controller_1.createManySolicitante);
r.post("/crearequipos", auth_controller_1.createManyEquipos);
r.get("/solicitantes", auth_controller_1.getSolicitantes);
r.put("/updateSolicitante", auth_controller_1.updateSolicitante);
r.post("/detalles", auth_controller_1.createManyDetalle);
r.get("/equipos", auth_controller_1.getAllEquipos);
//Funcionalidad de visitas
r.post("/crear_visita", auth_middleware_1.authGuard, auth_controller_1.crearVisita);
r.put("/finalizar_visita/:id", auth_middleware_1.authGuard, auth_controller_1.completarVisita);
r.put('/equipos/:id', auth_middleware_1.authGuard, auth_controller_1.actualizarEquipo);
r.post("/crearequipo", auth_middleware_1.authGuard, auth_controller_1.createEquipo);
r.post('/createSolicitante', auth_middleware_1.authGuard, auth_controller_1.createSolicitante);
// Rutas Sucursales
r.post('/sucursales', auth_middleware_1.authGuard, auth_controller_1.crearSucursal);
r.get('/empresas/:id/sucursales', auth_middleware_1.authGuard, auth_controller_1.obtenerSucursalesPorEmpresa);
r.get('/empresas/sucursales', auth_middleware_1.authGuard, auth_controller_1.obtenerEmpresasConSucursales);
exports.default = r;
