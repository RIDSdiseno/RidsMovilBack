import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import { crearEntrega, obtenerEntrega } from "../controllers/entregas.controller.js";
import evidenciasRoutes from "./evidencias.route.js";

const r = Router();

r.use(authGuard);
r.post("/", crearEntrega);
r.get("/:id", obtenerEntrega);
r.use("/:id/evidencias", evidenciasRoutes);

export default r;
