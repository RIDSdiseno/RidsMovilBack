// src/routes/evidencia.route.ts

import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import {
  confirmarEvidencia,
  listarEvidenciasPorEntrega,
  solicitarFirmaSubida,
} from "../controllers/evidencias.controller.js";

const r = Router({ mergeParams: true });

r.use(authGuard);
r.post("/firma", solicitarFirmaSubida);
r.post("/confirmar", confirmarEvidencia);
r.get("/", listarEvidenciasPorEntrega);

export default r;
