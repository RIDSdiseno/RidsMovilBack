// src/controllers/bitacora.controller.ts
import type {
    Request,
    Response,
} from "express";

import {
    IntranetBitacoraError,
    intranetBitacoraMultipartRequest,
    intranetBitacoraRequest,
} from "../services/intranet-bitacora.service.js";

/* =========================================================
   HELPERS
========================================================= */

type AuthenticatedRequest =
    Request & {
        user?: {
            id?: number;
            id_tecnico?: number;
            tecnicoId?: number;
            userId?: number;
        };
    };

function obtenerTecnicoId(
    req:
        Request
): number {
    const user =
        (
            req as AuthenticatedRequest
        ).user;

    const tecnicoId =
        Number(
            user?.id_tecnico ??
            user?.tecnicoId ??
            user?.id ??
            user?.userId
        );

    if (
        !Number.isInteger(
            tecnicoId
        ) ||
        tecnicoId <= 0
    ) {
        throw new IntranetBitacoraError(
            "No fue posible identificar al técnico autenticado",
            401
        );
    }

    return tecnicoId;
}

function validarId(
    value:
        unknown,
    nombre:
        string
) {
    const id =
        Number(
            value
        );

    if (
        !Number.isInteger(
            id
        ) ||
        id <= 0
    ) {
        throw new IntranetBitacoraError(
            `${nombre} inválido`,
            400
        );
    }

    return id;
}

function responderError(
    res:
        Response,
    error:
        unknown,
    fallback:
        string
) {
    if (
        error instanceof
        IntranetBitacoraError
    ) {
        return res
            .status(
                error.status
            )
            .json({
                error:
                    error.message,
            });
    }

    console.error(
        "[BITACORA][ERROR]",
        error
    );

    return res
        .status(500)
        .json({
            error:
                fallback,
        });
}

/* =========================================================
   BITÁCORA
========================================================= */

export async function listarBitacoras(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const data =
            await intranetBitacoraRequest(
                "/",
                {
                    tecnicoId,

                    query:
                        req.query,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error al obtener las bitácoras"
        );
    }
}

export async function crearBitacora(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        /*
         * Nunca confiar en tecnicoId
         * recibido desde Expo.
         */
        const {
            tecnicoId:
            _tecnicoIdIgnorado,
            ...body
        } =
            req.body ??
            {};

        const data =
            await intranetBitacoraRequest(
                "/",
                {
                    method:
                        "POST",

                    tecnicoId,

                    body,
                }
            );

        return res
            .status(201)
            .json(
                data
            );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error al crear la bitácora"
        );
    }
}

export async function obtenerBitacora(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}`,
                {
                    tecnicoId,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error al obtener la bitácora"
        );
    }
}

export async function actualizarBitacora(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const {
            tecnicoId:
            _tecnicoIdIgnorado,
            ...body
        } =
            req.body ??
            {};

        const data =
            await intranetBitacoraRequest(
                `/${id}`,
                {
                    method:
                        "PATCH",

                    tecnicoId,

                    body,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error al actualizar la bitácora"
        );
    }
}

export async function eliminarBitacora(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}`,
                {
                    method:
                        "DELETE",

                    tecnicoId,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error al eliminar la bitácora"
        );
    }
}

export async function actualizarRecordatorio(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/recordatorio`,
                {
                    method:
                        "PATCH",

                    tecnicoId,

                    body:
                        req.body,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error actualizando el recordatorio"
        );
    }
}

/* =========================================================
   OPCIONES RELACIONADAS
========================================================= */

export async function obtenerOpcionesRelacion(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const data =
            await intranetBitacoraRequest(
                "/opciones-relacion",
                {
                    tecnicoId,

                    query:
                        req.query,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error obteniendo opciones relacionadas"
        );
    }
}

/* =========================================================
   ETAPAS
========================================================= */

export async function obtenerEtapas(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/etapas`,
                {
                    tecnicoId,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error obteniendo las etapas"
        );
    }
}

export async function actualizarEtapa(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const etapaId =
            validarId(
                req.params.etapaId,
                "ID de etapa"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/etapas/${etapaId}`,
                {
                    method:
                        "PATCH",

                    tecnicoId,

                    body:
                        req.body,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error actualizando la etapa"
        );
    }
}

export async function completarEtapa(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const etapaId =
            validarId(
                req.params.etapaId,
                "ID de etapa"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/etapas/${etapaId}/completar`,
                {
                    method:
                        "POST",

                    tecnicoId,

                    body:
                        req.body ??
                        {},
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error completando la etapa"
        );
    }
}

export async function solicitarRevision(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const etapaId =
            validarId(
                req.params.etapaId,
                "ID de etapa"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/etapas/${etapaId}/solicitar-revision`,
                {
                    method:
                        "POST",

                    tecnicoId,

                    body:
                        req.body,
                }
            );

        return res
            .status(201)
            .json(
                data
            );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error solicitando la revisión"
        );
    }
}

export async function responderRevision(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const etapaId =
            validarId(
                req.params.etapaId,
                "ID de etapa"
            );

        const aprobacionId =
            validarId(
                req.params.aprobacionId,
                "ID de aprobación"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/etapas/${etapaId}/aprobaciones/${aprobacionId}/responder`,
                {
                    method:
                        "POST",

                    tecnicoId,

                    body:
                        req.body,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error respondiendo la revisión"
        );
    }
}

/* =========================================================
   EVIDENCIAS
========================================================= */

export async function obtenerEvidencias(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/evidencias`,
                {
                    tecnicoId,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error obteniendo evidencias"
        );
    }
}

export async function agregarEvidencia(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        if (
            !req.file
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Debes adjuntar una imagen o video",
                });
        }

        const data =
            await intranetBitacoraMultipartRequest(
                {
                    path:
                        `/${id}/evidencias`,

                    tecnicoId,

                    file:
                        req.file,

                    fields: {
                        etapa:
                            typeof req.body.etapa ===
                                "string"
                                ? req.body.etapa
                                : undefined,

                        descripcion:
                            typeof req.body.descripcion ===
                                "string"
                                ? req.body.descripcion
                                : undefined,
                    },
                }
            );

        return res
            .status(201)
            .json(
                data
            );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error agregando la evidencia"
        );
    }
}

export async function eliminarEvidencia(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora"
            );

        const evidenciaId =
            validarId(
                req.params.evidenciaId,
                "ID de evidencia"
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/evidencias/${evidenciaId}`,
                {
                    method:
                        "DELETE",

                    tecnicoId,
                }
            );

        return res.json(
            data
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error eliminando la evidencia"
        );
    }
}

export async function listarRevisores(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const data =
            await intranetBitacoraRequest(
                "/revisores",
                {
                    tecnicoId,
                }
            );

        return res.json(
            data
        );
    } catch (
    error
    ) {
        return responderError(
            res,
            error,
            "Error obteniendo técnicos revisores"
        );
    }
}

export async function obtenerPermisosBitacora(
    req: Request,
    res: Response,
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req,
            );

        const id =
            validarId(
                req.params.id,
                "ID de bitácora",
            );

        const data =
            await intranetBitacoraRequest(
                `/${id}/permisos`,
                {
                    tecnicoId,
                },
            );

        return res.json(
            data,
        );
    } catch (error) {
        return responderError(
            res,
            error,
            "Error obteniendo permisos de la bitácora",
        );
    }
}

export async function listarEmpresasBitacora(
    req:
        Request,
    res:
        Response
) {
    try {
        const tecnicoId =
            obtenerTecnicoId(
                req
            );

        const data =
            await intranetBitacoraRequest(
                "/empresas",
                {
                    tecnicoId,
                }
            );

        return res.json(
            data
        );
    } catch (
    error
    ) {
        return responderError(
            res,
            error,
            "Error obteniendo empresas"
        );
    }
}