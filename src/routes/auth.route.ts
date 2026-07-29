import { Router } from "express";
import {
    login, loginMicrosoft, registerUser, createManyempresa, crearVisita,
    cancelarVisita, completarVisita, logout, refresh, getAllUsers,
    finalizarAgendaVisita, iniciarRutaAgendaVisita, iniciarVisitaAgendaVisita, obtenerMisVisitasAsignadasHoy,
    obtenerVisitaDeAgenda,
    registrarUbicacionTecnico,
    createCliente, getAllClientes,
    deleteCliente,
    obtenerHistorialPorTecnico,
    createManySolicitante,
    createManyEquipos,
    getSolicitantes,
    getAllEquipos,
    getEquipoDetalleMovil,
    getClientesEconnet,
    updateSolicitante,
    actualizarEquipo,
    createManyDetalle,
    createEquipo,
    createSolicitante,
    crearSucursal,
    obtenerSucursalesPorEmpresa,
    obtenerEmpresasConSucursales,
    cambiarSolicitanteEquipo,
    createClienteEconnet
} from "../controllers/auth.controller";
import { authGuard } from "../middlewares/auth.middleware";

const r = Router();

r.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));

//Auth: solo login/microsoft/logout/refresh son públicos (pre-sesión).
r.post("/register", authGuard, registerUser)
r.post("/login", login)
r.post("/microsoft", loginMicrosoft)
r.post("/logout", logout)
r.post("/refresh", refresh);
r.get("/usuarios", authGuard, getAllUsers);
r.get("/clientes", authGuard, getAllClientes)
r.get("/clientes/econnet", authGuard, getClientesEconnet)
r.post("/clientes/econnet", authGuard, createClienteEconnet)
r.delete("/deletecliente/:id", authGuard, deleteCliente)
r.get("/historial/:id", authGuard, obtenerHistorialPorTecnico)
//para cargar "masivamente" las empresas (protegido: solo con sesión válida)
r.post("/carga", authGuard, createManyempresa)
r.post("/createcliente", authGuard, createCliente)
r.post("/crearsolicitante", authGuard, createManySolicitante)
r.post("/crearequipos", authGuard, createManyEquipos)
r.get("/solicitantes", authGuard, getSolicitantes)
r.put("/updateSolicitante", authGuard, updateSolicitante)
r.post("/detalles", authGuard, createManyDetalle)


r.get("/equipos", authGuard, getAllEquipos)
r.get("/equipos/:id", authGuard, getEquipoDetalleMovil)
r.put("/equipos/:id/solicitante",authGuard,cambiarSolicitanteEquipo)

//Funcionalidad de visitas
r.get("/agenda/mis-visitas/hoy", authGuard, obtenerMisVisitasAsignadasHoy)
r.get("/agenda/:id/visita", authGuard, obtenerVisitaDeAgenda)
r.post("/agenda/:id/iniciar-ruta", authGuard, iniciarRutaAgendaVisita)
r.post("/agenda/:id/iniciar-visita", authGuard, iniciarVisitaAgendaVisita)
r.post("/agenda/:id/finalizar-visita", authGuard, finalizarAgendaVisita)
r.post("/ubicaciones", authGuard, registrarUbicacionTecnico)
r.post("/crear_visita", authGuard, crearVisita)
r.put("/finalizar_visita/:id", authGuard, completarVisita)
r.put("/cancelar_visita/:id", authGuard, cancelarVisita)
r.put('/equipos/:id', authGuard, actualizarEquipo)
r.post("/crearequipo", authGuard, createEquipo)
r.post('/createSolicitante', authGuard, createSolicitante)

// Rutas Sucursales
r.post('/sucursales', authGuard, crearSucursal);
r.get('/empresas/:id/sucursales', authGuard, obtenerSucursalesPorEmpresa);
r.get('/empresas/sucursales', authGuard, obtenerEmpresasConSucursales);


export default r
