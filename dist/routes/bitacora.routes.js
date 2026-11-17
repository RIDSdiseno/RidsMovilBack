"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const bitacora_controller_js_1 = require("../controllers/bitacora.controller.js");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 150 *
            1024 *
            1024,
    },
});
router.get("/debug", (_req, res) => {
    return res.json({
        ok: true,
        message: "Router de Bitácora cargado",
    });
});
/* =========================================================
   AUTENTICACIÓN MÓVIL
========================================================= */
router.use(auth_middleware_1.authGuard);
/* =========================================================
   BITÁCORA
========================================================= */
router.get("/", bitacora_controller_js_1.listarBitacoras);
router.post("/", bitacora_controller_js_1.crearBitacora);
router.get("/revisores", (req, res, next) => {
    console.log("[BITACORA ROUTES] Entró a /revisores");
    next();
}, bitacora_controller_js_1.listarRevisores);
router.get("/empresas", bitacora_controller_js_1.listarEmpresasBitacora);
/*
 * IMPORTANTE:
 * opciones-relacion debe declararse antes de /:id
 */
router.get("/opciones-relacion", bitacora_controller_js_1.obtenerOpcionesRelacion);
router.get("/:id/permisos", bitacora_controller_js_1.obtenerPermisosBitacora);
router.get("/:id", (req, res, next) => {
    console.log("[BITACORA ROUTES] Entró a /:id", req.params.id);
    next();
}, bitacora_controller_js_1.obtenerBitacora);
router.patch("/:id", bitacora_controller_js_1.actualizarBitacora);
router.delete("/:id", bitacora_controller_js_1.eliminarBitacora);
router.patch("/:id/recordatorio", bitacora_controller_js_1.actualizarRecordatorio);
/* =========================================================
   ETAPAS
========================================================= */
router.get("/:id/etapas", bitacora_controller_js_1.obtenerEtapas);
router.patch("/:id/etapas/:etapaId", bitacora_controller_js_1.actualizarEtapa);
router.post("/:id/etapas/:etapaId/completar", bitacora_controller_js_1.completarEtapa);
router.post("/:id/etapas/:etapaId/solicitar-revision", bitacora_controller_js_1.solicitarRevision);
router.post("/:id/etapas/:etapaId/aprobaciones/:aprobacionId/responder", bitacora_controller_js_1.responderRevision);
/* =========================================================
   EVIDENCIAS
========================================================= */
router.get("/:id/evidencias", bitacora_controller_js_1.obtenerEvidencias);
router.post("/:id/evidencias", upload.single("file"), bitacora_controller_js_1.agregarEvidencia);
router.delete("/:id/evidencias/:evidenciaId", bitacora_controller_js_1.eliminarEvidencia);
exports.default = router;
