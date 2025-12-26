// src/routes/entregas.route.ts

import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import { crearEntrega, obtenerEntrega, listarEntregas, } from "../controllers/entregas.controller.js";
import evidenciasRoutes from "./evidencias.route.js";

const r = Router();

r.use(authGuard);
r.get("/", listarEntregas);
r.post("/", crearEntrega);
r.get("/:id", obtenerEntrega);
r.use("/:id/evidencias", evidenciasRoutes);

export default r;
