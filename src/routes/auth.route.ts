import { Router } from "express";
import { login, registerUser,createManyempresa, crearVisita, 
completarVisita, logout, refresh, getAllUsers, 
createCliente, getAllClientes, 
deleteCliente,
obtenerHistorialPorTecnico,
createManySolicitante,
createManyEquipos,
getSolicitantes,
getAllEquipos,
updateSolicitante} from "../controllers/auth.controller";
getSolicitantes, actualizarEquipo } from "../controllers/auth.controller";
import { authGuard } from "../middlewares/auth.middleware";

const r = Router();

r.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));

//Auth
r.post("/register",registerUser)
r.post("/login",login)
r.post("/logout",logout)
r.post("/refresh", refresh);
r.get("/usuarios",getAllUsers);
r.get("/clientes",getAllClientes)
r.delete("/deletecliente/:id",deleteCliente)
r.get("/historial/:id",authGuard,obtenerHistorialPorTecnico)
//para cargar "masivamente" las empresas
r.post("/carga",createManyempresa)
r.post("/createcliente",createCliente)
r.post("/crearsolicitante",createManySolicitante)
r.post("/crearequipos",createManyEquipos)
r.get("/solicitantes",getSolicitantes)
r.put("/updateSolicitante",updateSolicitante)

r.get("/equipos",getAllEquipos)

//Funcionalidad de visitas
r.post("/crear_visita",authGuard,crearVisita)
r.put("/finalizar_visita/:id",authGuard,completarVisita)
r.put('/equipos/:id', actualizarEquipo)



export default r