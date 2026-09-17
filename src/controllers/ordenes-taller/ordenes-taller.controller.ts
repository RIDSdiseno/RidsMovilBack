// src/controllers/ordenes-taller/ordenes-taller.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    crearIngresoTallerIntranet,
    IntranetTallerError,
} from "../../services/intranet-taller.service.js";

import {
    buildTallerEntradaFolder,
    createUploadSignature,
} from "../../config/cloudinary.js";

import {
    sendDeliveryPdfEmail,
} from "../../services/microsoft-mail.service.js";

const PRIORIDADES =
    new Set([
        "BAJA",
        "NORMAL",
        "ALTA",
    ]);

const EMAIL_REGEX =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* =========================================================
   POST /api/ordenes-taller/ingresos
========================================================= */

export async function crearIngresoTaller(
    req: Request,
    res: Response,
) {
    try {
        const tecnicoId =
            req.user?.id;

        if (!tecnicoId) {
            return res
                .status(401)
                .json({
                    error:
                        "Técnico no autenticado",
                });
        }

        const equipoId =
            Number(
                req.body?.equipoId,
            );

        const entidadId =
            Number(
                req.body?.entidadId,
            );

        const solicitanteFirmanteEntradaId =
            Number(
                req.body
                    ?.solicitanteFirmanteEntradaId,
            );

        const tipoTrabajo =
            String(
                req.body?.tipoTrabajo ??
                "",
            ).trim();

        const descripcion =
            String(
                req.body?.descripcion ??
                "",
            ).trim();

        const prioridadRaw =
            String(
                req.body?.prioridad ??
                "NORMAL",
            )
                .trim()
                .toUpperCase();

        const notas =
            String(
                req.body?.notas ??
                "",
            ).trim();

        const incluyeCargador =
            req.body
                ?.incluyeCargador ===
            true;

        const firmaEntradaUrl =
            String(
                req.body?.firmaEntradaUrl ??
                "",
            ).trim();

        const firmaEntradaPublicId =
            String(
                req.body?.firmaEntradaPublicId ??
                "",
            ).trim();

        /* =====================================================
           VALIDACIONES BÁSICAS
        ===================================================== */

        if (
            !Number.isInteger(
                equipoId,
            ) ||
            equipoId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Debe seleccionar un equipo válido",
                });
        }

        if (
            !Number.isInteger(
                entidadId,
            ) ||
            entidadId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Debe seleccionar una entidad válida",
                });
        }

        if (
            !Number.isInteger(
                solicitanteFirmanteEntradaId,
            ) ||
            solicitanteFirmanteEntradaId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Debe seleccionar un solicitante válido",
                });
        }

        if (!tipoTrabajo) {
            return res
                .status(400)
                .json({
                    error:
                        "El tipo de trabajo es obligatorio",
                });
        }

        if (!descripcion) {
            return res
                .status(400)
                .json({
                    error:
                        "La descripción es obligatoria",
                });
        }

        if (
            !PRIORIDADES.has(
                prioridadRaw,
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Prioridad inválida",
                });
        }

        if (!firmaEntradaUrl) {
            return res
                .status(400)
                .json({
                    error:
                        "La firma de recepción es obligatoria",
                });
        }

        if (!firmaEntradaPublicId) {
            return res
                .status(400)
                .json({
                    error:
                        "La firma de recepción no es válida",
                });
        }

        /* =====================================================
           VALIDAR EQUIPO
        ===================================================== */

        const equipo =
            await prisma.equipo.findUnique({
                where: {
                    id_equipo:
                        equipoId,
                },

                select: {
                    id_equipo:
                        true,

                    marca:
                        true,

                    modelo:
                        true,

                    serial:
                        true,
                },
            });

        if (!equipo) {
            return res
                .status(404)
                .json({
                    error:
                        "El equipo seleccionado no existe",
                });
        }

        /* =====================================================
           VALIDAR ENTIDAD

           La entidad puede ser PERSONA o EMPRESA.
           NO existe dependencia entre entidad y firmante.
        ===================================================== */

        const entidad =
            await prisma.entidadGestioo.findUnique({
                where: {
                    id:
                        entidadId,
                },

                select: {
                    id:
                        true,

                    nombre:
                        true,

                    rut:
                        true,

                    tipo:
                        true,

                    origen:
                        true,

                    empresaId:
                        true,
                },
            });

        if (!entidad) {
            return res
                .status(404)
                .json({
                    error:
                        "La entidad seleccionada no existe",
                });
        }

        /* =====================================================
           VALIDAR SOLICITANTE FIRMANTE

           Se busca directamente en BD.
           Debe estar activo y no eliminado.

           No se valida contra entidad/empresa:
           el firmante es independiente de la entidad.
        ===================================================== */

        const solicitanteFirmante =
            await prisma.solicitante.findFirst({
                where: {
                    id_solicitante:
                        solicitanteFirmanteEntradaId,

                    isActive:
                        true,

                    deletedAt:
                        null,
                },

                select: {
                    id_solicitante:
                        true,

                    nombre:
                        true,

                    email:
                        true,

                    rut:
                        true,

                    telefono:
                        true,

                    empresaId:
                        true,
                },
            });

        if (!solicitanteFirmante) {
            return res
                .status(404)
                .json({
                    error:
                        "El solicitante seleccionado no existe o está inactivo",
                });
        }

        /*
         * Nombre/correo usados para la OT
         * provienen de la BD, no del request.
         */
        const nombreFirmanteEntrada =
            solicitanteFirmante.nombre
                ?.trim() ??
            "";

        const emailFirmanteEntrada =
            solicitanteFirmante.email
                ?.trim()
                .toLowerCase() ??
            "";

        if (!nombreFirmanteEntrada) {
            return res
                .status(400)
                .json({
                    error:
                        "El solicitante seleccionado no tiene un nombre válido",
                });
        }

        if (
            !EMAIL_REGEX.test(
                emailFirmanteEntrada,
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "El solicitante seleccionado no tiene un correo válido",
                });
        }

        /* =====================================================
           LOG DE TRAZABILIDAD
        ===================================================== */

        console.log(
            "[TALLER] Creando ingreso",
            {
                tecnicoId,

                equipoId,

                entidadId,

                solicitanteFirmanteEntradaId:
                    solicitanteFirmante
                        .id_solicitante,

                nombreFirmanteEntrada,

                emailFirmanteEntrada,
            },
        );

        /* =====================================================
           LLAMAR INTRANET
        ===================================================== */

        const result =
            await crearIngresoTallerIntranet({
                tecnicoId,

                equipoId,

                entidadId,

                solicitanteFirmanteEntradaId:
                    solicitanteFirmante
                        .id_solicitante,

                tipoTrabajo,

                descripcion,

                prioridad:
                    prioridadRaw as
                    | "BAJA"
                    | "NORMAL"
                    | "ALTA",

                incluyeCargador,

                notas:
                    notas ||
                    null,

                nombreFirmanteEntrada,

                emailFirmanteEntrada,

                firmaEntradaUrl,

                firmaEntradaPublicId,

                firmaEntradaAt:
                    new Date()
                        .toISOString(),
            });

        return res
            .status(201)
            .json(
                result,
            );
    } catch (error: unknown) {
        console.error(
            "[RIDS MOVIL BACK - TALLER]",
            error,
        );

        if (
            error instanceof
            IntranetTallerError
        ) {
            /*
             * Un 401/403 de la Intranet no significa
             * que el JWT móvil haya expirado.
             */
            const status =
                error.status === 401 ||
                    error.status === 403
                    ? 502
                    : error.status;

            return res
                .status(status)
                .json({
                    error:
                        error.message,
                });
        }

        if (
            error instanceof Error
        ) {
            return res
                .status(500)
                .json({
                    error:
                        error.message,
                });
        }

        return res
            .status(500)
            .json({
                error:
                    "No se pudo registrar el ingreso al taller",
            });
    }
}

/* =========================================================
   GET /api/ordenes-taller/entidades
========================================================= */

export async function listarEntidadesTaller(
    req: Request,
    res: Response,
) {
    try {
        const search =
            typeof req.query.search ===
                "string"
                ? req.query.search.trim()
                : "";

        const entidades =
            await prisma.entidadGestioo.findMany({
                where: {
                    ...(search
                        ? {
                            OR: [
                                {
                                    nombre: {
                                        contains:
                                            search,

                                        mode:
                                            "insensitive",
                                    },
                                },

                                {
                                    rut: {
                                        contains:
                                            search,

                                        mode:
                                            "insensitive",
                                    },
                                },
                            ],
                        }
                        : {}),
                },

                orderBy: {
                    nombre:
                        "asc",
                },

                select: {
                    id:
                        true,

                    nombre:
                        true,

                    rut:
                        true,

                    correo:
                        true,

                    telefono:
                        true,

                    direccion:
                        true,

                    tipo:
                        true,

                    origen:
                        true,

                    empresaId:
                        true,
                },
            });

        return res.json({
            entidades,
        });
    } catch (error) {
        console.error(
            "[TALLER] Error listando entidades:",
            error,
        );

        return res
            .status(500)
            .json({
                error:
                    "No se pudieron cargar las entidades de Taller",
            });
    }
}

/* =========================================================
   GET /api/ordenes-taller/solicitantes
========================================================= */

export async function listarSolicitantesTaller(
    req: Request,
    res: Response,
) {
    try {
        const search =
            typeof req.query.search ===
                "string"
                ? req.query.search.trim()
                : "";

        const solicitantes =
            await prisma.solicitante.findMany({
                where: {
                    isActive:
                        true,

                    deletedAt:
                        null,

                    ...(search
                        ? {
                            OR: [
                                {
                                    nombre: {
                                        contains:
                                            search,

                                        mode:
                                            "insensitive",
                                    },
                                },

                                {
                                    email: {
                                        contains:
                                            search,

                                        mode:
                                            "insensitive",
                                    },
                                },

                                {
                                    rut: {
                                        contains:
                                            search,

                                        mode:
                                            "insensitive",
                                    },
                                },
                            ],
                        }
                        : {}),
                },

                orderBy: {
                    nombre:
                        "asc",
                },

                select: {
                    id_solicitante:
                        true,

                    nombre:
                        true,

                    email:
                        true,

                    telefono:
                        true,

                    rut:
                        true,

                    empresaId:
                        true,

                    empresa: {
                        select: {
                            id_empresa:
                                true,

                            nombre:
                                true,
                        },
                    },
                },
            });

        return res.json({
            solicitantes,
        });
    } catch (error) {
        console.error(
            "[TALLER] Error listando solicitantes:",
            error,
        );

        return res
            .status(500)
            .json({
                error:
                    "No se pudieron cargar los solicitantes",
            });
    }
}

/* =========================================================
   POST /api/ordenes-taller/firma-entrada
========================================================= */

export async function solicitarFirmaEntradaTaller(
    req: Request,
    res: Response,
) {
    try {
        const tecnicoId =
            req.user?.id;

        if (!tecnicoId) {
            return res
                .status(401)
                .json({
                    error:
                        "Técnico no autenticado",
                });
        }

        const equipoId =
            Number(
                req.body?.equipoId,
            );

        if (
            !Number.isInteger(
                equipoId,
            ) ||
            equipoId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "equipoId inválido",
                });
        }

        const equipo =
            await prisma.equipo.findUnique({
                where: {
                    id_equipo:
                        equipoId,
                },

                select: {
                    id_equipo:
                        true,
                },
            });

        if (!equipo) {
            return res
                .status(404)
                .json({
                    error:
                        "Equipo no encontrado",
                });
        }

        const folder =
            buildTallerEntradaFolder(
                equipoId,
            );

        const publicId =
            `firma-entrada-${equipoId}-${Date.now()}`;

        const firma =
            createUploadSignature({
                folder,

                publicId,
            });

        return res.json({
            ...firma,

            resourceType:
                "image",

            publicId,
        });
    } catch (error) {
        console.error(
            "[TALLER FIRMA ENTRADA]",
            error,
        );

        return res
            .status(500)
            .json({
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo preparar la firma",
            });
    }
}

/* =========================================================
   POST /api/ordenes-taller/:id/enviar-pdf
========================================================= */

export async function enviarPdfIngresoTaller(
    req: Request,
    res: Response,
) {
    try {
        const tecnicoId =
            req.user?.id;

        const tecnicoEmail =
            req.user?.email
                ?.trim()
                .toLowerCase();

        const tecnicoNombre =
            req.user?.nombre
                ?.trim();

        const ordenId =
            Number(
                req.params.id,
            );

        const pdfFile =
            req.file;

        /* =====================================================
           VALIDACIONES
        ===================================================== */

        if (
            !tecnicoId ||
            !tecnicoEmail
        ) {
            return res
                .status(401)
                .json({
                    error:
                        "Técnico no autenticado",
                });
        }

        if (
            !Number.isInteger(
                ordenId,
            ) ||
            ordenId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "ID de orden inválido",
                });
        }

        if (!pdfFile) {
            return res
                .status(400)
                .json({
                    error:
                        "Debe adjuntar el comprobante PDF",
                });
        }

        if (
            pdfFile.mimetype !==
            "application/pdf"
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "El adjunto debe ser un PDF",
                });
        }

        /* =====================================================
           OBTENER OT

           Además valida que haya sido creada
           por el técnico autenticado.
        ===================================================== */

        const orden =
            await prisma
                .detalleTrabajoGestioo
                .findFirst({
                    where: {
                        id:
                            ordenId,

                        tecnicoId,
                    },

                    include: {
                        entidad:
                            true,

                        tecnico: {
                            select: {
                                id_tecnico:
                                    true,

                                nombre:
                                    true,

                                email:
                                    true,
                            },
                        },

                        equipo: {
                            select: {
                                id_equipo:
                                    true,

                                marca:
                                    true,

                                modelo:
                                    true,

                                serial:
                                    true,
                            },
                        },
                    },
                });

        if (!orden) {
            return res
                .status(404)
                .json({
                    error:
                        "Orden de Taller no encontrada",
                });
        }

        /* =====================================================
           CORREO FIRMANTE

           No se recibe desde el frontend.
           Se usa el snapshot guardado en la OT.
        ===================================================== */

        const recipientEmail =
            orden.emailFirmanteEntrada
                ?.trim()
                .toLowerCase() ??
            "";

        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                .test(
                    recipientEmail,
                )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "La orden no tiene un correo válido para el firmante",
                });
        }

        const recipientName =
            orden.nombreFirmanteEntrada
                ?.trim() ||
            recipientEmail;

        const companyName =
            orden.entidad
                ?.nombre ||
            "Cliente";

        const pdfFileName =
            orden.numeroOrden
                ? `${orden.numeroOrden}.pdf`
                : `Orden-Taller-${orden.id}.pdf`;

        console.log(
            "[TALLER EMAIL] Preparando comprobante",
            {
                ordenId:
                    orden.id,

                numeroOrden:
                    orden.numeroOrden,

                recipientEmail,

                ccEmail:
                    tecnicoEmail,

                pdfFileName,

                pdfBytes:
                    pdfFile.size,
            },
        );

        /*
         * Igual que Entregas:
         *
         * TO = firmante
         * CC = técnico
         *
         * La función usa Graph primero
         * y SMTP como fallback.
         */
        void sendDeliveryPdfEmail({
            brand:
                "rids",

            ccEmail:
                tecnicoEmail,

            companyName,

            operation:
                "ingreso_taller",

            pdfBuffer:
                Buffer.from(
                    pdfFile.buffer,
                ),

            pdfFileName,

            recipientEmail,

            recipientName,

            senderName:
                tecnicoNombre ||
                tecnicoEmail,
        })
            .then(
                () => {
                    console.log(
                        "[TALLER EMAIL] Comprobante enviado",
                        {
                            ordenId:
                                orden.id,

                            recipientEmail,

                            ccEmail:
                                tecnicoEmail,
                        },
                    );
                },
            )
            .catch(
                (
                    error,
                ) => {
                    console.error(
                        "[TALLER EMAIL] Error enviando comprobante:",
                        error,
                    );
                },
            );

        /*
         * Mismo criterio que Entregas:
         * el envío queda en proceso.
         */
        return res
            .status(202)
            .json({
                ok:
                    true,

                emailQueued:
                    true,

                recipientEmail,

                ccEmail:
                    tecnicoEmail,
            });
    } catch (error) {
        console.error(
            "[TALLER EMAIL]",
            error,
        );

        return res
            .status(500)
            .json({
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo preparar el envío del comprobante",
            });
    }
}