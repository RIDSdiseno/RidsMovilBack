// src/controllers/equipos/equipos.controller.ts
import type { Request, Response } from "express";
import {
    EstadoEquipo,
    Prisma,
    TipoEquipo,
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { emparejarAdicionales } from "../../utils/adicionales";

/* =========================================================
   TIPOS
========================================================= */

type DetalleEquipoBody = {
    idEquipo: number;
    macWifi: string;
    redEthernet?: string;
    so: string;
    tipoDd: string;
    estadoAlm: string;
    office: string;
    teamViewer: string;
    claveTv: string;
    revisado: string;

    adminRidsUsuario?: string;
    adminRidsPassword?: string;

    usuarioEmpresa?: string;
    passwordEmpresa?: string;

    usuarioPersonal?: string;
    passwordPersonal?: string;
};

type EquipoInput = {
    idSolicitante: number;

    serial: string;
    marca: string;
    modelo: string;

    procesador: string;
    ram: string;
    disco: string;

    propiedad: string;
    propietarioExterno?: string;

    tipo?: string;
    estado?: string;

    anioPc?: number | string | null;

    observaciones?: string | null;

    macWifi?: string;
    redEthernet?: string;
    so?: string;
    tipoDd?: string;
    estadoAlm?: string;
    office?: string;

    teamViewer?: string;
    claveTv?: string;

    revisado?: string;

    adminRidsUsuario?: string;
    adminRidsPassword?: string;

    usuarioEmpresa?: string;
    passwordEmpresa?: string;

    usuarioPersonal?: string;
    passwordPersonal?: string;

    adicionales?: Array<{
        tipo?: string;
        descripcion?: string | null;
        cantidad?: number | string;
        serialAdicional?: string | null;
    }>;
};

/* =========================================================
   HELPERS
========================================================= */

const PROPIEDADES_EQUIPO_VALIDAS = [
    "Empresa",
    "Personal",
    "Externo",
] as const;

type PropiedadEquipoValida =
    (typeof PROPIEDADES_EQUIPO_VALIDAS)[number];

function normalizarPropiedadEquipoMovil(
    value: unknown,
): PropiedadEquipoValida {
    const propiedad = String(value ?? "Empresa").trim();

    if (
        (PROPIEDADES_EQUIPO_VALIDAS as readonly string[]).includes(
            propiedad,
        )
    ) {
        return propiedad as PropiedadEquipoValida;
    }

    return "Empresa";
}

function normalizarPropietarioExternoMovil(
    propiedad: PropiedadEquipoValida,
    value: unknown,
): string | null {
    if (propiedad !== "Externo") {
        return null;
    }

    const texto = String(value ?? "").trim();

    return texto || null;
}

function normalizarFechaRevisado(
    value?: string | null,
): string | null {
    if (!value) {
        return null;
    }

    const texto = String(value).trim();

    if (!texto) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return texto;
    }

    const clDash =
        /^(\d{2})-(\d{2})-(\d{4})$/.exec(texto);

    if (clDash) {
        const [, dia, mes, anio] = clDash;

        return `${anio}-${mes}-${dia}`;
    }

    return null;
}

export const createEquipo = async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<EquipoInput>;

    // Validaciones mínimas (ajústalas a tus reglas de negocio)
    if (typeof body.idSolicitante !== 'number') {
        return res.status(400).json({ error: 'idSolicitante es requerido y debe ser número' });
    }
    if (!body.serial || !body.marca || !body.modelo) {
        return res.status(400).json({ error: 'serial, marca y modelo son requeridos' });
    }

    const serial = body.serial.trim();
    const marca = body.marca.trim();
    const modelo = body.modelo.trim();
    const propiedad = normalizarPropiedadEquipoMovil(body.propiedad);
    const propietarioExterno = normalizarPropietarioExternoMovil(propiedad, body.propietarioExterno);
    const tipo = body.tipo && (Object.values(TipoEquipo) as string[]).includes(body.tipo)
        ? (body.tipo as TipoEquipo)
        : TipoEquipo.GENERICO;
    const estado = body.estado && (Object.values(EstadoEquipo) as string[]).includes(body.estado)
        ? (body.estado as EstadoEquipo)
        : EstadoEquipo.ACTIVO;
    const anioPc = body.anioPc !== undefined && body.anioPc !== null && body.anioPc !== ''
        ? Number(body.anioPc)
        : null;

    const observaciones = body.observaciones?.trim() || null;

    // Con relationMode="prisma" no hay FK en la BD; validamos que el solicitante
    // exista para no crear equipos huérfanos.
    const solicitanteExiste = await prisma.solicitante.findUnique({
        where: { id_solicitante: body.idSolicitante },
        select: { id_solicitante: true },
    });
    if (!solicitanteExiste) {
        return res.status(400).json({ error: 'El solicitante no existe' });
    }

    try {
        const equipo = await prisma.$transaction(async (tx) => {
            const created = await tx.equipo.create({
                data: {
                    idSolicitante: body.idSolicitante,
                    serial,
                    marca,
                    modelo,
                    procesador: body.procesador?.trim() ?? '',
                    ram: body.ram?.trim() ?? '',
                    disco: body.disco?.trim() ?? '',
                    propiedad,
                    propietarioExterno,
                    tipo,
                    estado,
                    observaciones,
                    ...(anioPc !== null && Number.isFinite(anioPc) && { anioPc, anioPcOrigen: 'MANUAL' }),
                },
            });

            const detalle = {
                macWifi: body.macWifi?.trim() || null,
                redEthernet: body.redEthernet?.trim() || null,
                so: body.so?.trim() || null,
                tipoDd: body.tipoDd?.trim() || null,
                estadoAlm: body.estadoAlm?.trim() || null,
                office: body.office?.trim() || null,
                teamViewer: body.teamViewer?.trim() || null,
                claveTv: body.claveTv?.trim() || null,
                revisado: normalizarFechaRevisado(body.revisado),
                adminRidsUsuario: body.adminRidsUsuario?.trim() || null,
                adminRidsPassword: body.adminRidsPassword?.trim() || null,
                usuarioEmpresa: body.usuarioEmpresa?.trim() || null,
                passwordEmpresa: body.passwordEmpresa?.trim() || null,
                usuarioPersonal: body.usuarioPersonal?.trim() || null,
                passwordPersonal: body.passwordPersonal?.trim() || null,
            };
            const hasDetalle = Object.values(detalle).some(Boolean);

            if (hasDetalle) {
                await tx.detalleEquipo.create({
                    data: {
                        idEquipo: created.id_equipo,
                        ...detalle,
                    },
                });
            }

            const adicionales = Array.isArray(body.adicionales)
                ? body.adicionales
                    .filter((item) => item.tipo?.trim())
                    .map((item) => ({
                        equipoId: created.id_equipo,
                        tipo: item.tipo!.trim(),
                        descripcion: item.descripcion?.trim() || null,
                        cantidad: Math.max(1, Number(item.cantidad) || 1),
                        serialAdicional: item.serialAdicional?.trim() || null,
                    }))
                : [];

            if (adicionales.length > 0) {
                await tx.equipoAdicional.createMany({ data: adicionales });
            }

            return tx.equipo.findUnique({
                where: { id_equipo: created.id_equipo },
                include: { equipo: true, adicionales: true },
            });
        });

        return res.status(201).json({
            message: 'Equipo creado',
            equipo, // devolvemos el registro creado para que la UI pueda pintar el resultado
        });
    } catch (error: any) {
        // duplicados (por ejemplo, serial único)
        if ((error as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
            const fields = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
            if (String(fields).includes('serialAdicional')) {
                return res.status(409).json({
                    error: 'Ya existe un adicional registrado con ese serial en otro equipo',
                });
            }
            return res.status(409).json({ error: `Ya existe un equipo con ese valor único (${fields})` });
        }
        console.error('Error al crear equipo:', error);
        return res.status(500).json({ error: 'Error al crear equipo' });
    }
};

export const createManyEquipos = async (req: Request, res: Response) => {
    const { equipos } = req.body;

    if (!Array.isArray(equipos) || equipos.length === 0) {
        return res.status(400).json({ error: 'Debes enviar un arreglo de equipos' });
    }

    try {
        const result = await prisma.equipo.createMany({
            data: equipos.map((e: {
                idSolicitante: number,
                serial: string,
                marca: string,
                modelo: string,
                procesador: string,
                ram: string,
                disco: string,
                propiedad: string
            }) => ({
                idSolicitante: e.idSolicitante,
                serial: e.serial,
                marca: e.marca,
                modelo: e.modelo,
                procesador: e.procesador,
                ram: e.ram,
                disco: e.disco,
                propiedad: e.propiedad
            })),
            skipDuplicates: true // opcional, evita insertar duplicados si hay constraint únicos
        });

        return res.status(201).json({
            message: `Se agregaron ${result.count} equipo(s)`,
        });
    } catch (error: any) {
        console.error('Error al insertar equipos:', error);
        return res.status(500).json({ error: 'Error al insertar equipos' });
    }
};


//GET Auth/getAllEquipos
export const getAllEquipos = async (req: Request, res: Response) => {
    try {
        // Oculta equipos de empresas desactivadas (Empresa.isActive), igual que
        // la intranet. Se consulta en vivo cada vez: al desactivar una empresa
        // nueva, sus equipos dejan de aparecer aqui sin tocar codigo.
        // Filtros y búsqueda opcionales (server-side). Si NO llega ningún parámetro
        // de paginación (page/limit), se devuelven todos los equipos que cumplan los
        // filtros (compatibilidad con los usos que esperan el listado completo).
        const q = req.query as Record<string, string | undefined>;
        const search = (q.search ?? '').trim();
        const empresaIdFiltro = q.empresaId && !Number.isNaN(Number(q.empresaId)) ? Number(q.empresaId) : null;
        const estadoFiltro = q.estado && (Object.values(EstadoEquipo) as string[]).includes(q.estado)
            ? (q.estado as EstadoEquipo)
            : null;
        const parseFecha = (v?: string) => {
            if (!v) return null;
            const d = new Date(v);
            return Number.isNaN(d.getTime()) ? null : d;
        };
        const finDia = (d: Date) => new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
        const ingresoDesde = parseFecha(q.ingresoDesde);
        const ingresoHasta = parseFecha(q.ingresoHasta);
        const edicionDesde = parseFecha(q.edicionDesde);
        const edicionHasta = parseFecha(q.edicionHasta);

        const paginar = q.page !== undefined || q.limit !== undefined;
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));
        const skip = (page - 1) * limit;

        const empresasInactivas = await prisma.empresa.findMany({
            where: { isActive: false },
            select: { id_empresa: true },
        });
        const idsEmpresasInactivas = empresasInactivas.map((e) => e.id_empresa);

        const condiciones: Prisma.EquipoWhereInput[] = [
            {
                OR: [
                    /*
                     * 1. Equipo con empresa directa válida.
                     */
                    {
                        empresaId: {
                            not: null,
                            notIn: idsEmpresasInactivas,
                        },
                    },

                    /*
                     * 2. Equipo sin empresa directa,
                     * pero con solicitante perteneciente
                     * a una empresa activa.
                     */
                    {
                        empresaId: null,
                        idSolicitante: {
                            not: null,
                        },
                        solicitante: {
                            is: {
                                empresa: {
                                    is: {
                                        isActive: true,
                                    },
                                },
                            },
                        },
                    },

                    /*
                     * 3. Equipo completamente sin clasificar:
                     * sin empresa y sin solicitante.
                     *
                     * Estos también deben aparecer
                     * en el listado móvil.
                     */
                    {
                        empresaId: null,
                        idSolicitante: null,
                    },
                ],
            },
        ];
        if (search) {
            condiciones.push({
                OR: [
                    { serial: { contains: search, mode: 'insensitive' } },
                    { marca: { contains: search, mode: 'insensitive' } },
                    { modelo: { contains: search, mode: 'insensitive' } },
                    { solicitante: { is: { nombre: { contains: search, mode: 'insensitive' } } } },
                ],
            });
        }
        if (empresaIdFiltro !== null) {
            condiciones.push({
                OR: [
                    {
                        empresaId: empresaIdFiltro,
                    },
                    {
                        empresaId: null,
                        solicitante: {
                            is: {
                                empresaId: empresaIdFiltro,
                            },
                        },
                    },
                ],
            });
        }
        if (estadoFiltro) {
            condiciones.push({ estado: estadoFiltro });
        }
        if (ingresoDesde || ingresoHasta) {
            condiciones.push({
                createdAt: {
                    ...(ingresoDesde ? { gte: ingresoDesde } : {}),
                    ...(ingresoHasta ? { lte: finDia(ingresoHasta) } : {}),
                }
            });
        }
        if (edicionDesde || edicionHasta) {
            condiciones.push({
                updatedAt: {
                    ...(edicionDesde ? { gte: edicionDesde } : {}),
                    ...(edicionHasta ? { lte: finDia(edicionHasta) } : {}),
                }
            });
        }
        const where: Prisma.EquipoWhereInput = { AND: condiciones };

        const total = paginar ? await prisma.equipo.count({ where }) : 0;

        const equipos = await prisma.equipo.findMany({
            where,
            orderBy: { id_equipo: 'desc' },
            ...(paginar ? { skip, take: limit } : {}),
            select: {
                id_equipo: true,
                serial: true,
                marca: true,
                modelo: true,
                tipo: true,
                estado: true,
                anioPc: true,
                createdAt: true,
                updatedAt: true,
                procesador: true,
                ram: true,
                disco: true,
                propiedad: true,
                lastSeenAt: true,

                // IMPORTANTE
                empresaId: true,
                idSolicitante: true,

                solicitante: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        empresaId: true,
                    },
                },

                equipo: {
                    select: {
                        macWifi: true,
                        redEthernet: true,
                        so: true,
                        tipoDd: true,
                        estadoAlm: true,
                        office: true,
                        teamViewer: true,
                        revisado: true,

                        oneDrive: true,
                        oneDriveEstado: true,
                        oneDriveInstalado: true,
                        oneDriveEnEjecucion: true,
                        oneDriveOperativo: true,
                        oneDriveUsuario: true,
                    },
                    orderBy: { id: 'desc' },
                    take: 1,
                },

                adicionales: {
                    select: {
                        id: true,
                        tipo: true,
                        descripcion: true,
                        cantidad: true,
                        serialAdicional: true,
                    },
                    orderBy: { id: 'asc' },
                },
            },
        });

        // Equipos con al menos una mantencion registrada, igual criterio que la
        // intranet (presencia de registros en EquipoMantencion, sin filtrar por
        // estado). Se consulta una sola vez, acotado a los equipos ya listados.
        const idsConMantencion = new Set(
            (
                await prisma.equipoMantencion.groupBy({
                    by: ['equipoId'],
                    where: { equipoId: { in: equipos.map((eq) => eq.id_equipo) } },
                })
            )
                .map((m) => m.equipoId)
                .filter((id): id is number => id != null),
        );

        const equiposMap = equipos.map(eq => {
            const detalle = eq.equipo[0];

            const oneDriveEstado =
                detalle?.oneDriveEstado
                    ?.trim()
                    .toUpperCase() ?? null;

            const tieneOneDrive =
                detalle?.oneDriveInstalado === true &&
                Boolean(detalle?.oneDriveUsuario?.trim()) &&
                oneDriveEstado !== 'NO_INSTALADO' &&
                oneDriveEstado !== 'SIN_USUARIO' &&
                oneDriveEstado !== 'SIN_INFORMACION';

            return {
                ...eq,

                tieneAgente: Boolean(eq.lastSeenAt),
                tieneMantencion: idsConMantencion.has(eq.id_equipo),
                tieneOneDrive,

                macWifi: detalle?.macWifi ?? '',
                redEthernet: detalle?.redEthernet ?? '',
                so: detalle?.so ?? '',
                tipoDd: detalle?.tipoDd ?? '',
                estadoAlm: detalle?.estadoAlm ?? '',
                office: detalle?.office ?? '',
                teamViewer: detalle?.teamViewer ?? '',
                revisado: detalle?.revisado ?? '',
                adicionales: eq.adicionales ?? [],

                empresaId:
                    eq.empresaId ??
                    eq.solicitante?.empresaId ??
                    null,

                nombreSolicitante:
                    eq.solicitante?.nombre ??
                    'Sin solicitante',
            };
        });

        equiposMap.forEach(eq => delete (eq as any).equipo);

        if (paginar) {
            return res.json({
                equipos: equiposMap,
                total,
                page,
                limit,
                hasMore: skip + equiposMap.length < total,
            });
        }
        return res.json({ equipos: equiposMap });
    } catch (e) {
        console.error('Error al obtener equipos', e);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// GET /auth/equipos/:id -- ficha completa de un equipo (para "ver/editar" en la app).
// Trae detalle tecnico, adicionales y quien lo creo y cuando. Los eventos del
// agente se ven solo desde la intranet: en la app basta con los iconos de
// agente/mantencion del listado, y no vale la pena cargar ese detalle aqui.
// Se pide solo al abrir el detalle de un equipo, no en el listado, para no
// cargar auditoria de los 400+ equipos de una vez.
export const getEquipoDetalleMovil = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        const equipo = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            include: {
                solicitante: { include: { empresa: true } },
                equipo: { orderBy: { id: 'desc' }, take: 1 },
                adicionales: true,
            },
        });

        if (!equipo) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        const [createLog, updateLog, softwares, ultimaMant] = await Promise.all([
            prisma.auditLog.findFirst({
                where: {
                    entity: 'Equipo',
                    entityId: String(id),
                    action: 'CREATE',
                },
                orderBy: {
                    createdAt: 'asc',
                },
            }),

            prisma.auditLog.findFirst({
                where: {
                    entity: 'Equipo',
                    entityId: String(id),
                    action: 'UPDATE',
                },
                orderBy: {
                    createdAt: 'desc',
                },
            }),

            prisma.equipoSoftware.findMany({
                where: {
                    equipoId: id,
                },
                orderBy: {
                    nombre: 'asc',
                },
            }),

            prisma.equipoMantencion.findFirst({
                where: {
                    equipoId: id,
                },
                orderBy: {
                    fechaInicio: 'desc',
                },
                select: {
                    fechaInicio: true,
                    fechaFin: true,
                    tecnicoId: true,
                    origen: true,
                },
            }),
        ]);

        type ActorEquipo = {
            tipo: 'TECNICO' | 'SISTEMA';
            id_tecnico: number | null;
            nombre: string;
            email: string | null;
        };

        const actorIds = Array.from(
            new Set(
                [
                    createLog?.actorId,
                    updateLog?.actorId,
                    ultimaMant?.tecnicoId,
                ].filter(
                    (actorId): actorId is number =>
                        typeof actorId === 'number',
                ),
            ),
        );

        const tecnicos =
            actorIds.length > 0
                ? await prisma.tecnico.findMany({
                    where: {
                        id_tecnico: {
                            in: actorIds,
                        },
                    },
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                })
                : [];

        const tecnicosMap = new Map(
            tecnicos.map((tecnico) => [
                tecnico.id_tecnico,
                tecnico,
            ]),
        );

        function resolverActor(actorId: number | null | undefined): ActorEquipo {
            if (actorId) {
                const tecnico = tecnicosMap.get(actorId);

                if (tecnico) {
                    return {
                        tipo: 'TECNICO',
                        id_tecnico: tecnico.id_tecnico,
                        nombre: tecnico.nombre,
                        email: tecnico.email,
                    };
                }
            }

            return {
                tipo: 'SISTEMA',
                id_tecnico: null,
                nombre: 'Agente / Sistema',
                email: null,
            };
        }

        const creadoPor = createLog
            ? resolverActor(createLog.actorId)
            : null;

        const ultimaEdicionPor = updateLog
            ? resolverActor(updateLog.actorId)
            : null;

        const ultimaMantencionPor: ActorEquipo | null =
            ultimaMant
                ? ultimaMant.tecnicoId
                    ? resolverActor(ultimaMant.tecnicoId)
                    : {
                        tipo: 'SISTEMA',
                        id_tecnico: null,
                        nombre: 'Agente / Sistema',
                        email: null,
                    }
                : null;

        const detalle = equipo.equipo[0] ?? null;

        return res.status(200).json({
            id_equipo: equipo.id_equipo,
            serial: equipo.serial,
            marca: equipo.marca,
            modelo: equipo.modelo,
            tipo: equipo.tipo,
            estado: equipo.estado,
            anioPc: equipo.anioPc,
            procesador: equipo.procesador,
            ram: equipo.ram,
            disco: equipo.disco,
            propiedad: equipo.propiedad,
            propietarioExterno: equipo.propietarioExterno,
            observaciones: equipo.observaciones ?? '',
            idSolicitante: equipo.idSolicitante,
            nombreSolicitante: equipo.solicitante?.nombre ?? 'S/A',
            empresaId:
                equipo.empresaId ??
                equipo.solicitante?.empresaId ??
                null,
            createdAt: equipo.createdAt,
            updatedAt: equipo.updatedAt,
            macWifi: detalle?.macWifi ?? '',
            redEthernet: detalle?.redEthernet ?? '',
            so: detalle?.so ?? '',
            tipoDd: detalle?.tipoDd ?? '',
            estadoAlm: detalle?.estadoAlm ?? '',
            office: detalle?.office ?? '',
            teamViewer: detalle?.teamViewer ?? '',
            claveTv: detalle?.claveTv ?? '',
            revisado: detalle?.revisado ?? '',
            adminRidsUsuario: detalle?.adminRidsUsuario ?? '',
            adminRidsPassword: detalle?.adminRidsPassword ?? '',
            usuarioEmpresa: detalle?.usuarioEmpresa ?? '',
            passwordEmpresa: detalle?.passwordEmpresa ?? '',
            usuarioPersonal: detalle?.usuarioPersonal ?? '',
            passwordPersonal: detalle?.passwordPersonal ?? '',
            adicionales: equipo.adicionales ?? [],
            creadoPor,
            creadoEn: createLog?.createdAt ?? equipo.createdAt,
            creacionAuditada: Boolean(createLog),

            ultimaEdicion: updateLog?.createdAt ?? equipo.updatedAt,
            ultimaEdicionPor,

            ultimaMantencion:
                ultimaMant?.fechaFin ??
                ultimaMant?.fechaInicio ??
                null,

            ultimaMantencionPor,
            diskFreeGb: equipo.diskFreeGb ?? null,
            diskTotalGb: equipo.diskTotalGb ?? null,
            antivirusNombre: detalle?.antivirusNombre ?? null,
            antivirusActivo: detalle?.antivirusActivo ?? null,
            firewallActivo: detalle?.firewallActivo ?? null,
            bitlockerEstado: detalle?.bitlockerEstado ?? null,
            windowsUpdate: detalle?.windowsUpdate ?? null,
            softwares: softwares.map((sw) => ({
                id: sw.id,
                nombre: sw.nombre,
                version: sw.version,
                publisher: sw.publisher,
            })),
        });
    } catch (e) {
        console.error('Error al obtener detalle de equipo:', e);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

export const actualizarEquipo = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

        const {
            serial,
            marca,
            modelo,
            disco,
            procesador,
            ram,
            propiedad,
            propietarioExterno,
            tipo,
            estado,
            anioPc,
            observaciones,
            macWifi,
            redEthernet,
            so,
            tipoDd,
            estadoAlm,
            office,
            teamViewer,
            claveTv,
            revisado,
            adminRidsUsuario,
            adminRidsPassword,
            usuarioEmpresa,
            passwordEmpresa,
            usuarioPersonal,
            passwordPersonal,
            adicionales,
        } = req.body ?? {};
        const keys = Object.keys(req.body || {});
        const allowed = new Set([
            "serial",
            "marca",
            "modelo",
            "disco",
            "procesador",
            "ram",
            "propiedad",
            "propietarioExterno",
            "tipo",
            "estado",
            "anioPc",
            "observaciones",
            "macWifi",
            "redEthernet",
            "so",
            "tipoDd",
            "estadoAlm",
            "office",
            "teamViewer",
            "claveTv",
            "revisado",
            "adminRidsUsuario",
            "adminRidsPassword",
            "usuarioEmpresa",
            "passwordEmpresa",
            "usuarioPersonal",
            "passwordPersonal",
            "adicionales",
        ]);
        const extras = keys.filter(k => !allowed.has(k));
        if (extras.length) {
            return res.status(400).json({ error: `Campos no permitidos: ${extras.join(", ")}` });
        }
        if (!keys.length) {
            return res.status(400).json({ error: "No hay campos para actualizar" });
        }

        const norm = (v: any): string | undefined => {
            if (typeof v === "undefined") return undefined;
            return String(v).trim();
        };
        const normNullable = (v: any): string | null | undefined => {
            const value = norm(v);
            if (typeof value === "undefined") return undefined;
            return value || null;
        };

        // Verifica que el equipo exista (importante si solo viene tipoDd)
        const existe = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            select: { id_equipo: true }
        });
        if (!existe) return res.status(404).json({ error: "Equipo no encontrado" });

        const dataEquipo: Prisma.EquipoUpdateInput = {};
        const vSerial = norm(serial);
        const vMarca = norm(marca);
        const vModelo = norm(modelo);
        const vDisco = norm(disco);
        const vProc = norm(procesador);
        const vRam = norm(ram);
        const vPropiedad = norm(propiedad);
        const vObservaciones = normNullable(observaciones);

        if (typeof vSerial !== "undefined") {
            if (!vSerial) return res.status(400).json({ error: "serial no puede estar vacío" });
            dataEquipo.serial = vSerial;
        }
        if (typeof vMarca !== "undefined") {
            if (!vMarca) return res.status(400).json({ error: "marca no puede estar vacía" });
            dataEquipo.marca = vMarca;
        }
        if (typeof vModelo !== "undefined") {
            if (!vModelo) return res.status(400).json({ error: "modelo no puede estar vacío" });
            dataEquipo.modelo = vModelo;
        }

        if (typeof vDisco !== "undefined") dataEquipo.disco = vDisco;
        if (typeof vProc !== "undefined") dataEquipo.procesador = vProc;
        if (typeof vRam !== "undefined") dataEquipo.ram = vRam;

        if (typeof vObservaciones !== "undefined") {
            dataEquipo.observaciones = vObservaciones;
        }

        if (typeof vPropiedad !== "undefined") {
            const propiedadNormalizada = normalizarPropiedadEquipoMovil(vPropiedad);
            dataEquipo.propiedad = propiedadNormalizada;
            dataEquipo.propietarioExterno = normalizarPropietarioExternoMovil(propiedadNormalizada, propietarioExterno);
        } else if (typeof propietarioExterno !== "undefined") {
            return res.status(400).json({ error: "Para actualizar propietarioExterno también debes enviar propiedad" });
        }

        if (typeof tipo !== "undefined") {
            if (!(Object.values(TipoEquipo) as string[]).includes(String(tipo))) {
                return res.status(400).json({ error: "tipo inválido" });
            }
            dataEquipo.tipo = tipo as TipoEquipo;
        }

        if (typeof estado !== "undefined") {
            if (!(Object.values(EstadoEquipo) as string[]).includes(String(estado))) {
                return res.status(400).json({ error: "estado inválido" });
            }
            dataEquipo.estado = estado as EstadoEquipo;
        }

        if (typeof anioPc !== "undefined") {
            if (anioPc === null || anioPc === "") {
                dataEquipo.anioPc = null;
                dataEquipo.anioPcOrigen = "NO_DETERMINADO";
            } else {
                const anioNum = Number(anioPc);
                if (!Number.isFinite(anioNum)) {
                    return res.status(400).json({ error: "anioPc inválido" });
                }
                dataEquipo.anioPc = anioNum;
                dataEquipo.anioPcOrigen = "MANUAL";
            }
        }

        const detalleData: Record<string, string | null | undefined> = {
            macWifi: normNullable(macWifi),
            redEthernet: normNullable(redEthernet),
            so: normNullable(so),
            tipoDd: normNullable(tipoDd),
            estadoAlm: normNullable(estadoAlm),
            office: normNullable(office),
            teamViewer: normNullable(teamViewer),
            claveTv: normNullable(claveTv),
            revisado: typeof revisado === "undefined" ? undefined : normalizarFechaRevisado(revisado),
            adminRidsUsuario: normNullable(adminRidsUsuario),
            adminRidsPassword: normNullable(adminRidsPassword),
            usuarioEmpresa: normNullable(usuarioEmpresa),
            passwordEmpresa: normNullable(passwordEmpresa),
            usuarioPersonal: normNullable(usuarioPersonal),
            passwordPersonal: normNullable(passwordPersonal),
        };
        const dataDetalle = Object.fromEntries(
            Object.entries(detalleData).filter(([, value]) => typeof value !== "undefined"),
        ) as Record<string, string | null>;

        const adicionalesData = Array.isArray(adicionales)
            ? adicionales
                .filter((item) => typeof item?.tipo !== "undefined" && String(item.tipo).trim())
                .map((item) => ({
                    // `id` es opcional: las versiones actuales de la app no lo envían y
                    // el emparejamiento cae al serial o al tipo. Si en el futuro lo
                    // manda, se usa como clave exacta.
                    id: Number.isInteger(Number(item.id)) && Number(item.id) > 0 ? Number(item.id) : null,
                    tipo: String(item.tipo).trim(),
                    descripcion: normNullable(item.descripcion) ?? null,
                    cantidad: Math.max(1, Number(item.cantidad) || 1),
                    serialAdicional: normNullable(item.serialAdicional) ?? null,
                }))
            : undefined;

        const result = await prisma.$transaction(async (tx) => {
            // 1) Actualizar Equipo si corresponde
            const updatedEquipo = (Object.keys(dataEquipo).length > 0)
                ? await tx.equipo.update({
                    where: { id_equipo: id },
                    data: dataEquipo,
                    select: {
                        id_equipo: true, marca: true, modelo: true, serial: true,
                        disco: true, procesador: true, ram: true, propiedad: true,
                        observaciones: true,
                    },
                })
                : await tx.equipo.findUnique({
                    where: { id_equipo: id },
                    select: {
                        id_equipo: true, marca: true, modelo: true, serial: true,
                        disco: true, procesador: true, ram: true, propiedad: true,
                        observaciones: true,
                    },
                });

            // 2) Actualizar/crear DetalleEquipo si vino informacion tecnica en el body
            let detalle = null;

            if (Object.keys(dataDetalle).length > 0) {
                // Tomamos el último detalle (por id desc). Si no hay, lo creamos.
                const last = await tx.detalleEquipo.findFirst({
                    where: { idEquipo: id },
                    orderBy: { id: "desc" },
                    select: { id: true },
                });

                if (last) {
                    detalle = await tx.detalleEquipo.update({
                        where: { id: last.id },
                        data: dataDetalle,
                    });
                } else {
                    detalle = await tx.detalleEquipo.create({
                        data: { idEquipo: id, ...dataDetalle },
                    });
                }
            }

            if (typeof adicionalesData !== "undefined") {
                // Se reconcilia contra lo que ya existe en vez de borrar y recrear.
                // EquipoAdicional lleva `estado` y `origen`, que administra la
                // intranet: recrear las filas los devolvía a ASIGNADO/MANUAL y cambiaba
                // los id, perdiendo en silencio el trabajo hecho allá cada vez que un
                // técnico guardaba un equipo desde la app.
                const existentes = await tx.equipoAdicional.findMany({
                    where: { equipoId: id },
                    select: { id: true, tipo: true, descripcion: true, serialAdicional: true },
                    orderBy: { id: "asc" },
                });

                const emparejados = emparejarAdicionales(adicionalesData, existentes);

                for (const { entrada, existenteId } of emparejados.actualizar) {
                    await tx.equipoAdicional.update({
                        where: { id: existenteId },
                        data: {
                            tipo: entrada.tipo,
                            descripcion: entrada.descripcion,
                            cantidad: entrada.cantidad,
                            serialAdicional: entrada.serialAdicional,
                        },
                    });
                }

                if (emparejados.crear.length > 0) {
                    await tx.equipoAdicional.createMany({
                        data: emparejados.crear.map((entrada) => ({
                            tipo: entrada.tipo,
                            descripcion: entrada.descripcion,
                            cantidad: entrada.cantidad,
                            serialAdicional: entrada.serialAdicional,
                            equipoId: id,
                        })),
                    });
                }

                if (emparejados.eliminar.length > 0) {
                    await tx.equipoAdicional.deleteMany({
                        where: { id: { in: emparejados.eliminar } },
                    });
                }
            }

            return { updatedEquipo, detalle };
        });

        return res.status(200).json({
            message: "Equipo actualizado",
            equipo: result.updatedEquipo,
            detalleActualizado: result.detalle,
        });
    } catch (e: any) {
        if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
            const fields = (e as Prisma.PrismaClientKnownRequestError).meta?.target;
            // El serial de un adicional es único a nivel global, no por equipo: sin
            // distinguirlo, el técnico veía "ya existe un equipo" cuando el conflicto
            // era de un accesorio.
            if (String(fields).includes("serialAdicional")) {
                return res.status(409).json({
                    error: "Ya existe un adicional registrado con ese serial en otro equipo",
                });
            }
            return res.status(409).json({ error: `Ya existe un equipo con ese valor único (${fields})` });
        }
        if (e?.code === "P2025") return res.status(404).json({ error: "Equipo no encontrado" });
        console.error("Error al actualizar equipo:", e);
        return res.status(500).json({ error: "Error al actualizar equipo" });
    }
};

// PUT /auth/equipos/:id/asignacion
export const cambiarAsignacionEquipo = async (
    req: Request,
    res: Response,
) => {
    try {
        const equipoId =
            Number(req.params.id);

        const {
            empresaId,
            solicitanteId,
        } = req.body ?? {};

        if (
            !Number.isInteger(equipoId) ||
            equipoId <= 0
        ) {
            return res.status(400).json({
                error: "ID de equipo inválido",
            });
        }

        /*
         * Permitimos null porque un equipo puede
         * quedar temporalmente sin empresa o
         * sin solicitante.
         */
        const empresaIdFinal =
            empresaId === null ||
                typeof empresaId === "undefined"
                ? null
                : Number(empresaId);

        const solicitanteIdFinal =
            solicitanteId === null ||
                typeof solicitanteId === "undefined"
                ? null
                : Number(solicitanteId);

        if (
            empresaIdFinal !== null &&
            (
                !Number.isInteger(
                    empresaIdFinal
                ) ||
                empresaIdFinal <= 0
            )
        ) {
            return res.status(400).json({
                error: "empresaId inválido",
            });
        }

        if (
            solicitanteIdFinal !== null &&
            (
                !Number.isInteger(
                    solicitanteIdFinal
                ) ||
                solicitanteIdFinal <= 0
            )
        ) {
            return res.status(400).json({
                error: "solicitanteId inválido",
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
            return res.status(404).json({
                error:
                    "Equipo no encontrado",
            });
        }

        /*
         * Validar empresa.
         */
        if (
            empresaIdFinal !== null
        ) {
            const empresa =
                await prisma.empresa.findUnique({
                    where: {
                        id_empresa:
                            empresaIdFinal,
                    },
                    select: {
                        id_empresa:
                            true,
                        isActive:
                            true,
                    },
                });

            if (!empresa) {
                return res.status(404).json({
                    error:
                        "Empresa no encontrada",
                });
            }

            if (!empresa.isActive) {
                return res.status(400).json({
                    error:
                        "La empresa seleccionada está inactiva",
                });
            }
        }

        /*
         * Validar solicitante.
         *
         * Además comprobamos que pertenezca
         * a la empresa seleccionada.
         */
        if (
            solicitanteIdFinal !== null
        ) {
            const solicitante =
                await prisma.solicitante.findFirst({
                    where: {
                        id_solicitante:
                            solicitanteIdFinal,

                        deletedAt:
                            null,
                    },
                    select: {
                        id_solicitante:
                            true,

                        empresaId:
                            true,

                        isActive:
                            true,
                    },
                });

            if (!solicitante) {
                return res.status(404).json({
                    error:
                        "Solicitante no encontrado",
                });
            }

            if (
                solicitante.isActive ===
                false
            ) {
                return res.status(400).json({
                    error:
                        "El solicitante seleccionado está inactivo",
                });
            }

            if (
                empresaIdFinal !== null &&
                solicitante.empresaId !==
                empresaIdFinal
            ) {
                return res.status(400).json({
                    error:
                        "El solicitante no pertenece a la empresa seleccionada",
                });
            }
        }

        /*
         * Si existe solicitante, pero no enviaron
         * empresa, podemos obtener la empresa
         * automáticamente desde el solicitante.
         */
        let empresaFinal =
            empresaIdFinal;

        if (
            empresaFinal === null &&
            solicitanteIdFinal !== null
        ) {
            const solicitante =
                await prisma.solicitante.findUnique({
                    where: {
                        id_solicitante:
                            solicitanteIdFinal,
                    },
                    select: {
                        empresaId:
                            true,
                    },
                });

            empresaFinal =
                solicitante?.empresaId ??
                null;
        }

        const actualizado =
            await prisma.equipo.update({
                where: {
                    id_equipo: equipoId,
                },

                data: {
                    empresaId: empresaFinal,
                    idSolicitante: solicitanteIdFinal,
                },

                select: {
                    id_equipo: true,
                    empresaId: true,
                    idSolicitante: true,

                    solicitante: {
                        select: {
                            id_solicitante: true,
                            nombre: true,
                            empresaId: true,
                        },
                    },
                },
            });

        return res.status(200).json({
            message:
                "Asignación del equipo actualizada correctamente",

            equipo:
                actualizado,
        });

    } catch (error) {
        console.error(
            "[CAMBIAR_ASIGNACION_EQUIPO]",
            error,
        );

        return res.status(500).json({
            error:
                "Error interno al cambiar la asignación",
        });
    }
};

export const createManyDetalle = async (req: Request, res: Response) => {
    const { detalles } = req.body as { detalles?: DetalleEquipoBody[] };;

    if (!Array.isArray(detalles) || detalles.length === 0) {
        return res.status(400).json({ error: 'Debes enviar un arreglo de detalles' })
    }

    try {
        // (Opcional) Valida/coacciona por si vienen como string desde JSON/CSV/form
        const data: Prisma.DetalleEquipoCreateManyInput[] = detalles.map((e) => ({
            idEquipo: typeof e.idEquipo === 'string' ? Number(e.idEquipo) : e.idEquipo,
            macWifi: e.macWifi?.trim(),
            redEthernet: e.redEthernet?.trim(),
            so: e.so?.trim(),
            tipoDd: e.tipoDd?.trim(),
            estadoAlm: e.estadoAlm?.trim(),
            office: e.office?.trim(),
            teamViewer: e.teamViewer?.trim(),
            claveTv: e.claveTv?.trim(),
            revisado: e.revisado?.trim(),
            adminRidsUsuario: e.adminRidsUsuario?.trim(),
            adminRidsPassword: e.adminRidsPassword?.trim(),
            usuarioEmpresa: e.usuarioEmpresa?.trim(),
            passwordEmpresa: e.passwordEmpresa?.trim(),
            usuarioPersonal: e.usuarioPersonal?.trim(),
            passwordPersonal: e.passwordPersonal?.trim(),
        }));

        const result = await prisma.detalleEquipo.createMany({
            data
        });

        return res.status(201).json({ message: `Se agregaron ${result.count} detalle(s)` });
    } catch (e: any) {
        console.error('Error al insertar detalles: ', e);
        return res.status(500).json({ error: JSON.stringify(e) });
    }
};