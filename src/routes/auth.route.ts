import { Router } from "express";
import { login, registerUser,createManyempresa, crearVisita, completarVisita } from "../controllers/auth.controller";

const r = Router();

r.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));

//Auth
r.post("/register",registerUser)
r.post("/login",login)

//para cargar "masivamente" las empresas
r.post("/carga",createManyempresa)

//Funcionalidad de visitas
r.post("/crear_visita",crearVisita)
r.put("/finalizar_visita",completarVisita)



export default r