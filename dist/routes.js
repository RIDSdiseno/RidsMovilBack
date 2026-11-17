"use strict";
// src/routes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_route_js_1 = __importDefault(require("./routes/auth.route.js"));
const equipos_routes_js_1 = __importDefault(require("./routes/equipos/equipos.routes.js"));
const entregas_route_js_1 = __importDefault(require("./routes/entregas.route.js"));
const solicitantes_sync_routes_js_1 = __importDefault(require("./routes/solicitantes-sync/solicitantes-sync.routes.js"));
const ordenes_taller_routes_js_1 = __importDefault(require("./routes/ordenes-taller/ordenes-taller.routes.js"));
const bitacora_routes_js_1 = __importDefault(require("./routes/bitacora.routes.js"));
const router = (0, express_1.Router)();
router.get("/health", (_req, res) => res.json({
    ok: true,
    service: "API Movil",
    ts: Date.now(),
}));
/* =========================================================
   API MÓVIL
========================================================= */
router.use("/auth", auth_route_js_1.default);
router.use("/auth", equipos_routes_js_1.default);
router.use("/entregas", entregas_route_js_1.default);
router.use("/solicitantes-sync", solicitantes_sync_routes_js_1.default);
router.use("/ordenes-taller", ordenes_taller_routes_js_1.default);
router.get("/bitacora-debug", (_req, res) => {
    return res.json({
        ok: true,
        message: "El routes.ts móvil está cargado",
    });
});
router.use("/bitacora", bitacora_routes_js_1.default);
exports.default = router;
