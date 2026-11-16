// src/routes.ts

import { Router } from "express";

import authRoutes from "./routes/auth.route.js";
import equiposRoutes from "./routes/equipos/equipos.routes.js";
import entregasRoutes from "./routes/entregas.route.js";
import solicitantesSyncRoutes from "./routes/solicitantes-sync/solicitantes-sync.routes.js";
import ordenestallerRoutes from "./routes/ordenes-taller/ordenes-taller.routes.js";
import bitacoraRoutes from "./routes/bitacora.routes.js";

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

router.use("/solicitantes-sync", solicitantesSyncRoutes);

router.use("/ordenes-taller", ordenestallerRoutes);

router.get(
    "/bitacora-debug",
    (_req, res) => {
        return res.json({
            ok: true,
            message:
                "El routes.ts móvil está cargado",
        });
    },
);

router.use("/bitacora", bitacoraRoutes);

export default router;