import {
    Router,
} from "express";

import multer from "multer";

import {
    authGuard,
} from "../middlewares/auth.middleware";

import {
    actualizarBitacora,
    actualizarEtapa,
    actualizarRecordatorio,
    agregarEvidencia,
    completarEtapa,
    crearBitacora,
    eliminarBitacora,
    eliminarEvidencia,
    listarBitacoras,
    obtenerBitacora,
    obtenerEtapas,
    obtenerEvidencias,
    obtenerOpcionesRelacion,
    responderRevision,
    solicitarRevision,
    listarRevisores,
    obtenerPermisosBitacora,
    listarEmpresasBitacora,
} from "../controllers/bitacora.controller.js";

const router =
    Router();

const upload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                150 *
                1024 *
                1024,
        },
    });

router.get(
    "/debug",
    (_req, res) => {
        return res.json({
            ok: true,
            message:
                "Router de Bitácora cargado",
        });
    },
);

/* =========================================================
   AUTENTICACIÓN MÓVIL
========================================================= */

router.use(
    authGuard
);

/* =========================================================
   BITÁCORA
========================================================= */

router.get(
    "/",
    listarBitacoras
);

router.post(
    "/",
    crearBitacora
);

router.get(
    "/revisores",
    (
        req,
        res,
        next
    ) => {
        console.log(
            "[BITACORA ROUTES] Entró a /revisores"
        );

        next();
    },
    listarRevisores
);

router.get(
    "/empresas",
    listarEmpresasBitacora
);

/*
 * IMPORTANTE:
 * opciones-relacion debe declararse antes de /:id
 */
router.get(
    "/opciones-relacion",
    obtenerOpcionesRelacion
);

router.get(
    "/:id/permisos",
    obtenerPermisosBitacora,
);

router.get(
    "/:id",
    (
        req,
        res,
        next
    ) => {
        console.log(
            "[BITACORA ROUTES] Entró a /:id",
            req.params.id
        );

        next();
    },
    obtenerBitacora
);

router.patch(
    "/:id",
    actualizarBitacora
);

router.delete(
    "/:id",
    eliminarBitacora
);

router.patch(
    "/:id/recordatorio",
    actualizarRecordatorio
);

/* =========================================================
   ETAPAS
========================================================= */

router.get(
    "/:id/etapas",
    obtenerEtapas
);

router.patch(
    "/:id/etapas/:etapaId",
    actualizarEtapa
);

router.post(
    "/:id/etapas/:etapaId/completar",
    completarEtapa
);

router.post(
    "/:id/etapas/:etapaId/solicitar-revision",
    solicitarRevision
);

router.post(
    "/:id/etapas/:etapaId/aprobaciones/:aprobacionId/responder",
    responderRevision
);

/* =========================================================
   EVIDENCIAS
========================================================= */

router.get(
    "/:id/evidencias",
    obtenerEvidencias
);

router.post(
    "/:id/evidencias",
    upload.single(
        "file"
    ),
    agregarEvidencia
);

router.delete(
    "/:id/evidencias/:evidenciaId",
    eliminarEvidencia
);

export default router;