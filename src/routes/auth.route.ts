import { Router } from "express";
import { login, registerUser,createManyempresa } from "../controllers/auth.controller";

const r = Router();

r.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));

//Auth
r.post("/register",registerUser)
r.post("/login",login)
r.post("/carga",createManyempresa)



export default r