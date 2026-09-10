// src/services/intranet-sync.service.ts

function getRequiredEnv(
    name: string,
): string {
    const value =
        process.env[name];

    if (!value) {
        throw new Error(
            `${name} no está configurada`,
        );
    }

    return value;
}

export class IntranetRequestError extends Error {
    status: number;

    constructor(
        message: string,
        status: number,
    ) {
        super(message);

        this.name =
            "IntranetRequestError";

        this.status =
            status;
    }
}

const INTRANET_API_URL =
    getRequiredEnv(
        "INTRANET_API_URL",
    );

const INTRANET_INTERNAL_API_KEY =
    getRequiredEnv(
        "INTRANET_INTERNAL_API_KEY",
    );

type SyncSolicitantesParams = {
    empresaId: number;
    domain: string;
};

type SyncSolicitanteParams = {
    empresaId: number;
    domain: string;
    email: string;
};

async function intranetRequest(
    path: string,
    options: RequestInit,
) {
    const response =
        await fetch(
            `${INTRANET_API_URL}${path}`,
            {
                ...options,

                headers: {
                    "Content-Type":
                        "application/json",

                    "x-internal-api-key":
                        INTRANET_INTERNAL_API_KEY,

                    ...(options.headers ?? {}),
                },
            },
        );

    const data =
        await response.json().catch(
            () => null,
        );

    if (!response.ok) {
        throw new IntranetRequestError(
            data?.error ??
            data?.message ??
            `Error intranet ${response.status}`,
            response.status,
        );
    }

    return data;
}

/* =========================================================
   GOOGLE
========================================================= */

export async function syncGoogleEmpresa(
    params: SyncSolicitantesParams,
) {
    return intranetRequest(
        "/sync/google/users",
        {
            method: "POST",

            body: JSON.stringify({
                empresaId:
                    params.empresaId,

                domain:
                    params.domain
                        .trim()
                        .toLowerCase(),
            }),
        },
    );
}

export async function syncGoogleUsuario(
    params: SyncSolicitanteParams,
) {
    return intranetRequest(
        "/sync/google/users",
        {
            method: "PUT",

            body: JSON.stringify({
                empresaId:
                    params.empresaId,

                domain:
                    params.domain
                        .trim()
                        .toLowerCase(),

                email:
                    params.email
                        .trim()
                        .toLowerCase(),
            }),
        },
    );
}

/* =========================================================
   MICROSOFT
========================================================= */

export async function syncMicrosoftEmpresa(
    params: SyncSolicitantesParams,
) {
    return intranetRequest(
        "/sync/microsoft/users",
        {
            method: "POST",

            body: JSON.stringify({
                empresaId:
                    params.empresaId,

                domain:
                    params.domain
                        .trim()
                        .toLowerCase(),
            }),
        },
    );
}

export async function syncMicrosoftUsuario(
    params: SyncSolicitanteParams,
) {
    return intranetRequest(
        "/sync/microsoft/users",
        {
            method: "PUT",

            body: JSON.stringify({
                empresaId:
                    params.empresaId,

                domain:
                    params.domain
                        .trim()
                        .toLowerCase(),

                email:
                    params.email
                        .trim()
                        .toLowerCase(),
            }),
        },
    );
}