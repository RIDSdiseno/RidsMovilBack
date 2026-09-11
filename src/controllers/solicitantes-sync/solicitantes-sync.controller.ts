// src/controllers/solicitantes-sync/solicitantes-sync.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    IntranetRequestError,
    syncGoogleEmpresa,
    syncGoogleUsuario,
    syncMicrosoftEmpresa,
    syncMicrosoftUsuario,
} from "../../services/intranet-sync.service.js";

/* =========================================================
   ERROR DE VALIDACIÓN
========================================================= */

class ValidationError extends Error {
    status = 400;

    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

/* =========================================================
   VALIDACIONES
========================================================= */

function validarEmpresaDominio(
    empresaId: unknown,
    domain: unknown,
) {
    const empresa =
        Number(empresaId);

    const dominio =
        String(domain ?? "")
            .trim()
            .toLowerCase();

    if (
        !Number.isInteger(empresa) ||
        empresa <= 0
    ) {
        throw new ValidationError(
            "empresaId inválido",
        );
    }

    if (!dominio) {
        throw new ValidationError(
            "domain es obligatorio",
        );
    }

    return {
        empresaId: empresa,
        domain: dominio,
    };
}

function validarEmail(
    email: unknown,
) {
    const normalized =
        String(email ?? "")
            .trim()
            .toLowerCase();

    if (!normalized) {
        throw new ValidationError(
            "email es obligatorio",
        );
    }

    return normalized;
}

/* =========================================================
   RESPUESTA DE ERROR
========================================================= */

function responderError(
    res: Response,
    error: unknown,
    fallbackMessage: string,
) {
    if (
        error instanceof
        IntranetRequestError
    ) {
        const status =
            error.status === 401 ||
                error.status === 403
                ? 502
                : error.status;

        return res
            .status(status)
            .json({
                ok: false,
                error:
                    error.message,
            });
    }

    if (
        error instanceof
        ValidationError
    ) {
        return res
            .status(error.status)
            .json({
                ok: false,
                error:
                    error.message,
            });
    }

    return res
        .status(500)
        .json({
            ok: false,
            error:
                error instanceof Error
                    ? error.message
                    : fallbackMessage,
        });
}

/* =========================================================
   GOOGLE
========================================================= */

export async function sincronizarGoogleEmpresa(
    req: Request,
    res: Response,
) {
    try {
        const params =
            validarEmpresaDominio(
                req.body?.empresaId,
                req.body?.domain,
            );

        const result =
            await syncGoogleEmpresa(
                params,
            );

        return res.json(
            result,
        );
    } catch (error) {
        console.error(
            "[MOVIL sync Google]",
            error,
        );

        return responderError(
            res,
            error,
            "Error sincronizando Google",
        );
    }
}

export async function sincronizarGoogleUsuario(
    req: Request,
    res: Response,
) {
    try {
        const params =
            validarEmpresaDominio(
                req.body?.empresaId,
                req.body?.domain,
            );

        const email =
            validarEmail(
                req.body?.email,
            );

        const result =
            await syncGoogleUsuario({
                ...params,
                email,
            });

        return res.json(
            result,
        );
    } catch (error) {
        console.error(
            "[MOVIL sync Google usuario]",
            error,
        );

        return responderError(
            res,
            error,
            "Error sincronizando usuario Google",
        );
    }
}

/* =========================================================
   MICROSOFT
========================================================= */

export async function sincronizarMicrosoftEmpresa(
    req: Request,
    res: Response,
) {
    try {
        const params =
            validarEmpresaDominio(
                req.body?.empresaId,
                req.body?.domain,
            );

        const result =
            await syncMicrosoftEmpresa(
                params,
            );

        return res.json(
            result,
        );
    } catch (error) {
        console.error(
            "[MOVIL sync Microsoft]",
            error,
        );

        return responderError(
            res,
            error,
            "Error sincronizando Microsoft",
        );
    }
}

export async function sincronizarMicrosoftUsuario(
    req: Request,
    res: Response,
) {
    try {
        const params =
            validarEmpresaDominio(
                req.body?.empresaId,
                req.body?.domain,
            );

        const email =
            validarEmail(
                req.body?.email,
            );

        const result =
            await syncMicrosoftUsuario({
                ...params,
                email,
            });

        return res.json(
            result,
        );
    } catch (error) {
        console.error(
            "[MOVIL sync Microsoft usuario]",
            error,
        );

        return responderError(
            res,
            error,
            "Error sincronizando usuario Microsoft",
        );
    }
}