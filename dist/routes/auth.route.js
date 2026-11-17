"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.routes.ts
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const visitas_pendientes_controller_1 = require("../controllers/visitas-pendientes.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const empresas_favoritas_controller_1 = require("../controllers/empresas-favoritas.controller");
const r = (0, express_1.Router)();
r.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));
//Auth: solo login/microsoft/logout/refresh son públicos (pre-sesión).
r.post("/register", auth_middleware_1.authGuard, auth_controller_1.registerUser);
r.post("/login", auth_controller_1.login);
r.post("/microsoft", auth_controller_1.loginMicrosoft);
r.post("/logout", auth_controller_1.logout);
r.post("/refresh", auth_controller_1.refresh);
r.get("/usuarios", auth_middleware_1.authGuard, auth_controller_1.getAllUsers);
r.get("/clientes", auth_middleware_1.authGuard, auth_controller_1.getAllClientes);
r.get("/clientes/econnet", auth_middleware_1.authGuard, auth_controller_1.getClientesEconnet);
r.post("/clientes/econnet", auth_middleware_1.authGuard, auth_controller_1.createClienteEconnet);
r.get("/empresas-favoritas", auth_middleware_1.authGuard, empresas_favoritas_controller_1.obtenerEmpresasFavoritas);
r.put("/empresas-favoritas/:origen/:empresaId", auth_middleware_1.authGuard, empresas_favoritas_controller_1.agregarEmpresaFavorita);
r.delete("/empresas-favoritas/:origen/:empresaId", auth_middleware_1.authGuard, empresas_favoritas_controller_1.eliminarEmpresaFavorita);
r.delete("/deletecliente/:id", auth_middleware_1.authGuard, auth_controller_1.deleteCliente);
r.get("/historial/:id", auth_middleware_1.authGuard, auth_controller_1.obtenerHistorialPorTecnico);
//para cargar "masivamente" las empresas (protegido: solo con sesión válida)
r.post("/carga", auth_middleware_1.authGuard, auth_controller_1.createManyempresa);
r.post("/createcliente", auth_middleware_1.authGuard, auth_controller_1.createCliente);
r.post("/crearsolicitante", auth_middleware_1.authGuard, auth_controller_1.createManySolicitante);
r.get("/solicitantes", auth_middleware_1.authGuard, auth_controller_1.getSolicitantes);
r.put("/updateSolicitante", auth_middleware_1.authGuard, auth_controller_1.updateSolicitante);
//Funcionalidad de visitas
r.get("/agenda/mis-visitas/hoy", auth_middleware_1.authGuard, auth_controller_1.obtenerMisVisitasAsignadasHoy);
r.get("/agenda/:id/visita", auth_middleware_1.authGuard, auth_controller_1.obtenerVisitaDeAgenda);
r.post("/agenda/:id/iniciar-ruta", auth_middleware_1.authGuard, auth_controller_1.iniciarRutaAgendaVisita);
r.post("/agenda/:id/iniciar-visita", auth_middleware_1.authGuard, auth_controller_1.iniciarVisitaAgendaVisita);
r.post("/agenda/:id/finalizar-visita", auth_middleware_1.authGuard, auth_controller_1.finalizarAgendaVisita);
r.post("/ubicaciones", auth_middleware_1.authGuard, auth_controller_1.registrarUbicacionTecnico);
r.post("/crear_visita", auth_middleware_1.authGuard, auth_controller_1.crearVisita);
r.put("/finalizar_visita/:id", auth_middleware_1.authGuard, auth_controller_1.completarVisita);
r.put("/cancelar_visita/:id", auth_middleware_1.authGuard, auth_controller_1.cancelarVisita);
r.get("/visitas/pendientes", auth_middleware_1.authGuard, visitas_pendientes_controller_1.listarVisitasPendientes);
r.post('/createSolicitante', auth_middleware_1.authGuard, auth_controller_1.createSolicitante);
// Rutas Sucursales
r.post('/sucursales', auth_middleware_1.authGuard, auth_controller_1.crearSucursal);
r.get('/empresas/:id/sucursales', auth_middleware_1.authGuard, auth_controller_1.obtenerSucursalesPorEmpresa);
r.get('/empresas/sucursales', auth_middleware_1.authGuard, auth_controller_1.obtenerEmpresasConSucursales);
exports.default = r;
