// src/services/intranet-taller.service.ts

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

export class IntranetTallerError extends Error {
    status: number;

    constructor(
        message: string,
        status: number,
    ) {
        super(message);

        this.name =
            "IntranetTallerError";

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

export type CrearIngresoTallerPayload = {
    tecnicoId: number;

    equipoId: number;

    entidadId: number;

    solicitanteFirmanteEntradaId: number;

    tipoTrabajo: string;

    descripcion: string;

    prioridad:
    | "BAJA"
    | "NORMAL"
    | "ALTA";

    incluyeCargador: boolean;

    notas?:
    | string
    | null;

    nombreFirmanteEntrada: string;

    emailFirmanteEntrada: string;

    firmaEntradaUrl: string;

    firmaEntradaPublicId: string;

    firmaEntradaAt: string;
};

export async function crearIngresoTallerIntranet(
    payload:
        CrearIngresoTallerPayload,
) {
    const response =
        await fetch(
            `${INTRANET_API_URL}/internal/mobile/taller/ingresos`,
            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "x-internal-api-key":
                        INTRANET_INTERNAL_API_KEY,
                },

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    const data =
        await response
            .json()
            .catch(
                () => null,
            );

    if (!response.ok) {
        throw new IntranetTallerError(
            data?.error ??
            data?.message ??
            `Error Intranet ${response.status}`,
            response.status,
        );
    }

    return data;
}