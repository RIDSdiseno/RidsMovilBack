// src/routes.ts

import { Router } from "express";

import authRoutes from "./routes/auth.route.js";
import equiposRoutes from "./routes/equipos/equipos.routes.js";
import entregasRoutes from "./routes/entregas.route.js";

const router = Router();

router.get(
  "/health",
  (_req, res) =>
    res.json({
      ok: true,
      service: "API Movil",
      ts: Date.now(),
    }),
);

/* =========================================================
   API MÓVIL
========================================================= */

router.use("/auth", authRoutes);

router.use("/auth", equiposRoutes);

router.use("/entregas", entregasRoutes);

export default router;