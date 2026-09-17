import {
    Router,
} from "express";

import multer from "multer";

import {
    crearIngresoTaller,
    enviarPdfIngresoTaller,
    listarEntidadesTaller,
    listarSolicitantesTaller,
    solicitarFirmaEntradaTaller,
} from "../../controllers/ordenes-taller/ordenes-taller.controller.js";

import {
    authGuard,
} from "../../middlewares/auth.middleware.js";

const router =
    Router();

const upload =
    multer({
        limits: {
            fileSize:
                8 * 1024 * 1024,
        },

        storage:
            multer.memoryStorage(),
    });

router.get(
    "/entidades",
    authGuard,
    listarEntidadesTaller,
);

router.get(
    "/solicitantes",
    authGuard,
    listarSolicitantesTaller,
);

router.post(
    "/firma-entrada",
    authGuard,
    solicitarFirmaEntradaTaller,
);

router.post(
    "/ingresos",
    authGuard,
    crearIngresoTaller,
);

/*
 * Enviar comprobante de ingreso
 */
router.post(
    "/:id/enviar-pdf",
    authGuard,
    upload.single(
        "pdf",
    ),
    enviarPdfIngresoTaller,
);

export default router;