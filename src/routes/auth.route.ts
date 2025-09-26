import { Router } from "express";
import { login, registerUser,createManyempresa, crearVisita, 
completarVisita, logout, refresh, getAllUsers, 
createCliente, getAllClientes, 
deleteCliente} from "../controllers/auth.controller";
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
//para cargar "masivamente" las empresas
r.post("/carga",authGuard,createManyempresa)
r.post("/createcliente",createCliente)


//Funcionalidad de visitas
r.post("/crear_visita",authGuard,crearVisita)
r.put("/finalizar_visita",authGuard,completarVisita)



export default r