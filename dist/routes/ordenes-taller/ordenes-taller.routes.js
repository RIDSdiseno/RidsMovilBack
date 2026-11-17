"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const ordenes_taller_controller_js_1 = require("../../controllers/ordenes-taller/ordenes-taller.controller.js");
const auth_middleware_js_1 = require("../../middlewares/auth.middleware.js");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    limits: {
        fileSize: 8 * 1024 * 1024,
    },
    storage: multer_1.default.memoryStorage(),
});
router.get("/entidades", auth_middleware_js_1.authGuard, ordenes_taller_controller_js_1.listarEntidadesTaller);
router.get("/solicitantes", auth_middleware_js_1.authGuard, ordenes_taller_controller_js_1.listarSolicitantesTaller);
router.post("/firma-entrada", auth_middleware_js_1.authGuard, ordenes_taller_controller_js_1.solicitarFirmaEntradaTaller);
router.post("/ingresos", auth_middleware_js_1.authGuard, ordenes_taller_controller_js_1.crearIngresoTaller);
/*
 * Enviar comprobante de ingreso
 */
router.post("/:id/enviar-pdf", auth_middleware_js_1.authGuard, upload.single("pdf"), ordenes_taller_controller_js_1.enviarPdfIngresoTaller);
exports.default = router;
