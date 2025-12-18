"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerEmpresasConSucursales = exports.obtenerSucursalesPorEmpresa = exports.crearSucursal = exports.createSolicitante = exports.createEquipo = exports.createManyDetalle = exports.actualizarEquipo = exports.getAllEquipos = exports.updateSolicitante = exports.getSolicitantes = exports.createManyEquipos = exports.createManySolicitante = exports.obtenerHistorialPorTecnico = exports.completarVisita = exports.crearVisita = exports.createManyempresa = exports.refresh = exports.logout = exports.getAllUsers = exports.login = exports.createCliente = exports.deleteCliente = exports.getAllClientes = exports.registerUser = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const prisma = new client_1.PrismaClient;
/* =========================
   CONFIG / CONSTANTES
========================= */
// JWT para Access Token (corto)
const JWT_SECRET = process.env.JWT_SECRET ?? "dev_secret"; // ⚠️ cambia en prod
const ACCESS_EXPIRES_SEC = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 180 * 60); // 15 min
// Refresh Token (cookie) duración
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS ?? 7); // sin "recordarme"
const REFRESH_REMEMBER_DAYS = Number(process.env.REFRESH_REMEMBER_DAYS ?? 60); // con "recordarme"
// Cookies (ajusta en prod)
const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? "false") === "true";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE ?? "lax";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
// 👇 muy importante si tus rutas están bajo /api/auth
const COOKIE_PATH = process.env.COOKIE_PATH ?? "/api/auth";
/* =========================
   HELPERS
========================= */
// Access Token (JWT)
function signAccessToken(payload, expiresInSec = ACCESS_EXPIRES_SEC) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
}
// Refresh Token aleatorio + hash SHA-256 (se guarda sólo el hash)
function generateRT() {
    return crypto_1.default.randomBytes(64).toString("base64url");
}
function hashRT(rt) {
    return crypto_1.default.createHash("sha256").update(rt).digest("hex");
}
function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}
function parseRemember(v) {
    if (typeof v === "boolean")
        return v;
    if (typeof v === "string")
        return v.toLowerCase() === "true";
    return false;
}
function setRefreshCookie(res, rt, days) {
    const maxAge = days * 24 * 60 * 60 * 1000;
    res.cookie("rt", rt, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        domain: COOKIE_DOMAIN,
        maxAge,
        path: COOKIE_PATH, // <- clave para que el navegador/cliente la envíe a /api/auth/*
    });
}
function clearRefreshCookie(res) {
    res.clearCookie("rt", {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        domain: COOKIE_DOMAIN,
        path: COOKIE_PATH,
    });
}
/* =========================
   CONTROLADORES
========================= */
//POST Auth/register
const registerUser = async (req, res) => {
    try {
        const { nombre, email, password } = req.body;
        //validaciones basicas
        if (!nombre || !email || !password) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }
        //Se normaliza el email
        const emailNorm = String(email).trim().toLowerCase();
        const existing = await prisma.tecnico.findUnique({ where: { email: emailNorm } });
        if (existing)
            return res.status(409).json({ error: "Usuario ya existe" });
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        const newUser = await prisma.tecnico.create({
            data: {
                nombre,
                email: emailNorm,
                passwordHash,
                status: true
            },
            select: { id_tecnico: true, nombre: true, email: true },
        });
        return res.status(201).json({ user: newUser });
    }
    catch (error) {
        console.error("Register error", error);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.registerUser = registerUser;
//GET /Auth/getAllClientes
const getAllClientes = async (req, res) => {
    try {
        const clientes = await prisma.empresa.findMany({
            orderBy: { nombre: "asc" },
        });
        return res.json(clientes);
    }
    catch (e) {
        console.error("Error al obtener categorias: ", JSON.stringify(e));
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.getAllClientes = getAllClientes;
//DELETE /Auth/deleteCliente
const deleteCliente = async (req, res) => {
    const { id } = req.body; // Ahora lees del body
    if (!id)
        return res.status(400).json({ error: 'ID requerido' });
    try {
        await prisma.empresa.delete({ where: { id_empresa: Number(id) } });
        return res.status(204).send();
    }
    catch (e) {
        if (e.code === "P2025") {
            return res.status(404).json({ error: "Cliente no encontrado" });
        }
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.deleteCliente = deleteCliente;
//POST /Auth/createCliente
const createCliente = async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) {
        return res.status(400).json({ error: "El nombre de cliente es obligatorio" });
    }
    try {
        const cliente = await prisma.empresa.create({ data: { nombre } });
        return res.status(201).json(cliente);
    }
    catch (e) {
        console.error("Error al crear cliente: ", JSON.stringify(e));
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.createCliente = createCliente;
//POST /auth/login
const login = async (req, res) => {
    try {
        const { email, password, remember } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Correo y contraseña son obligatorios" });
        }
        const emailNorm = email.trim().toLowerCase();
        const user = await prisma.tecnico.findUnique({
            where: { email: emailNorm },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                passwordHash: true,
                status: true,
            },
        });
        if (!user || !user.status) {
            // Dummy compare para timing safe
            await bcrypt_1.default.compare(password, "$2b$10$invalidinvalidinvalidinvalidinv12345678901234567890");
            return res.status(401).json({ error: "Credenciales inválidas" });
        }
        const ok = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ error: "Credenciales inválidas" });
        // 1) Access Token (corto)
        const at = signAccessToken({
            id: user.id_tecnico,
            email: user.email,
            nombreUsuario: user.nombre,
        });
        // 2) Refresh Token (cookie httpOnly) + registro en DB
        const rememberFlag = Boolean(remember);
        const days = rememberFlag ? REFRESH_REMEMBER_DAYS : REFRESH_DAYS;
        const rt = generateRT(); // valor que va a cookie
        const rtDigest = hashRT(rt); // hash que guardamos en DB
        // userAgent / ip como string | null (no undefined)
        const userAgent = req.get("user-agent") ?? null;
        const ip = (req.ip ?? req.socket?.remoteAddress ?? null);
        await prisma.refreshToken.create({
            data: {
                userId: user.id_tecnico,
                rtHash: rtDigest,
                expiresAt: addDays(days),
                userAgent, // string | null
                ip, // string | null
            },
        });
        // Setear cookie httpOnly
        setRefreshCookie(res, rt, days);
        const { passwordHash, ...safeUser } = user;
        return res.json({ token: at, user: { ...safeUser }, remember: rememberFlag });
    }
    catch (err) {
        console.error("login error:", err);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.login = login;
const getAllUsers = async (_req, res) => {
    try {
        const users = await prisma.tecnico.findMany({
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true
            },
        });
        return res.json({ users });
    }
    catch (error) {
        console.error("Error al obtener usuarios: ", JSON.stringify(error));
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};
exports.getAllUsers = getAllUsers;
// POST /auth/logout
const logout = async (req, res) => {
    try {
        const rt = req.cookies?.rt;
        if (rt) {
            const digest = hashRT(rt);
            const row = await prisma.refreshToken.findFirst({ where: { rtHash: digest } });
            if (row && !row.revokedAt) {
                await prisma.refreshToken.update({
                    where: { id: row.id },
                    data: { revokedAt: new Date() },
                });
            }
        }
        clearRefreshCookie(res);
        return res.json({ ok: true });
    }
    catch (error) {
        console.error("logout error:", error);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.logout = logout;
// POST /auth/refresh
// Valida por COOKIE httpOnly `rt`, rota el RT y devuelve nuevo Access Token
const refresh = async (req, res) => {
    try {
        const rt = req.cookies?.rt;
        if (!rt)
            return res.status(401).json({ error: "Sin refresh token" });
        const digest = hashRT(rt);
        const row = await prisma.refreshToken.findFirst({
            where: { rtHash: digest },
            include: { user: true },
        });
        if (!row) {
            clearRefreshCookie(res);
            return res.status(401).json({ error: "Refresh inválido" });
        }
        if (row.revokedAt) {
            await prisma.refreshToken.updateMany({
                where: { userId: row.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            clearRefreshCookie(res);
            return res.status(401).json({ error: "Refresh revocado" });
        }
        if (row.expiresAt.getTime() <= Date.now()) {
            clearRefreshCookie(res);
            return res.status(401).json({ error: "Refresh expirado" });
        }
        if (!row.user.status) {
            await prisma.refreshToken.update({
                where: { id: row.id },
                data: { revokedAt: new Date() },
            });
            clearRefreshCookie(res);
            return res.status(403).json({ error: "Usuario deshabilitado" });
        }
        const rememberParam = parseRemember(req.query.remember);
        const days = rememberParam ? REFRESH_REMEMBER_DAYS : REFRESH_DAYS;
        // ROTACIÓN: revocar actual y emitir nuevo
        const newRt = generateRT();
        const newDigest = hashRT(newRt);
        // userAgent / ip como string | null
        const ua = req.get("user-agent") ?? null;
        const ipAddr = (req.ip ?? req.socket?.remoteAddress ?? null);
        await prisma.$transaction(async (tx) => {
            await tx.refreshToken.update({
                where: { id: row.id },
                data: { revokedAt: new Date() },
            });
            await tx.refreshToken.create({
                data: {
                    userId: row.userId,
                    rtHash: newDigest,
                    expiresAt: addDays(days),
                    userAgent: ua, // string | null
                    ip: ipAddr, // string | null
                    replacedByTokenId: row.id,
                },
            });
        });
        setRefreshCookie(res, newRt, days);
        const at = signAccessToken({
            id: row.user.id_tecnico,
            email: row.user.email,
            nombreUsuario: row.user.nombre,
        });
        return res.json({ token: at, remember: rememberParam });
    }
    catch (e) {
        console.error("refresh error:", e);
        clearRefreshCookie(res);
        return res.status(401).json({ error: "Refresh inválido" });
    }
};
exports.refresh = refresh;
//Carga masiva de empresa
const createManyempresa = async (req, res) => {
    const { empresa } = req.body;
    if (!Array.isArray(empresa) || empresa.length === 0) {
        return res.status(400).json({ error: "Debes enviar un arreglo de empresa" });
    }
    try {
        const result = await prisma.empresa.createMany({
            data: empresa.map((e) => ({ nombre: e.nombre })),
            skipDuplicates: true, // evita error si alguna ya existe
        });
        return res.status(201).json({
            message: `Se agregaron ${result.count} empresas`,
        });
    }
    catch (error) {
        console.error("Error al insertar empresa:", error);
        return res.status(500).json({ error: "Error al insertar empresa" });
    }
};
exports.createManyempresa = createManyempresa;
// En tu backend - modificar la función crearVisita
const crearVisita = async (req, res) => {
    try {
        console.log("Datos recibidos para crear la visita:", req.body);
        const { empresaId, tecnicoId, sucursalId, latitud, longitud } = req.body;
        if (!empresaId || !tecnicoId) {
            return res.status(400).json({ error: "empresaId y tecnicoId son obligatorios" });
        }
        const empresaIdInt = Number(empresaId);
        const tecnicoIdInt = Number(tecnicoId);
        const sucursalIdInt = sucursalId ? Number(sucursalId) : null;
        if (isNaN(empresaIdInt) || isNaN(tecnicoIdInt)) {
            return res.status(400).json({ error: "Los IDs deben ser números válidos" });
        }
        // Guardar coordenadas en formato string "lat,lon"
        const coordenadas = latitud && longitud ? `${latitud},${longitud}` : null;
        const nuevaVisita = await prisma.visita.create({
            data: {
                empresaId: empresaIdInt,
                tecnicoId: tecnicoIdInt,
                sucursalId: sucursalIdInt,
                solicitante: 'No especificado',
                inicio: new Date(),
                status: client_1.EstadoVisita.PENDIENTE,
                direccion_visita: coordenadas // ← Ahora guarda solo coordenadas
            },
            select: {
                id_visita: true,
                empresaId: true,
                tecnicoId: true,
                sucursalId: true,
                inicio: true,
                status: true,
                direccion_visita: true
            }
        });
        return res.status(201).json({ visita: nuevaVisita });
    }
    catch (error) {
        console.error('Error al crear la visita:', error);
        return res.status(500).json({ error: `Error interno al crear la visita: ${error.message || error}` });
    }
};
exports.crearVisita = crearVisita;
const completarVisita = async (req, res) => {
    try {
        const visitaId = Number(req.params.id);
        if (!Number.isFinite(visitaId)) {
            return res.status(400).json({ error: "ID de visita inválido" });
        }
        const v = await prisma.visita.findUnique({
            where: { id_visita: visitaId },
            select: {
                id_visita: true,
                empresaId: true,
                tecnicoId: true,
                sucursalId: true,
                direccion_visita: true,
                inicio: true,
            },
        });
        if (!v)
            return res.status(404).json({ error: "Visita no encontrada" });
        const { confImpresoras, confTelefonos, confPiePagina, otros, otrosDetalle, ccleaner, actualizaciones, antivirus, estadoDisco, licenciaWindows, licenciaOffice, rendimientoEquipo, mantenimientoReloj, ecografo, realizado, solicitantes, direccion_visita } = req.body ?? {};
        // Normalizar booleanos
        const toB = (x) => Boolean(x);
        const payloadFlags = {
            confImpresoras: toB(confImpresoras),
            confTelefonos: toB(confTelefonos),
            confPiePagina: toB(confPiePagina),
            otros: toB(otros),
            ccleaner: toB(ccleaner),
            actualizaciones: toB(actualizaciones),
            antivirus: toB(antivirus),
            estadoDisco: toB(estadoDisco),
            licenciaWindows: toB(licenciaWindows),
            licenciaOffice: toB(licenciaOffice),
            rendimientoEquipo: toB(rendimientoEquipo),
            mantenimientoReloj: toB(mantenimientoReloj),
            ecografo: toB(ecografo),
        };
        let otrosDetalleValidado = null;
        if (payloadFlags.otros) {
            const t = (otrosDetalle ?? '').toString().trim();
            if (!t)
                return res.status(400).json({ error: "'otrosDetalle' no puede estar vacío si 'otros' está marcado" });
            otrosDetalleValidado = t;
        }
        // Validar solicitantes
        const arr = Array.isArray(solicitantes) ? solicitantes : [];
        const ids = arr.map(s => Number(s?.id_solicitante)).filter(n => Number.isFinite(n));
        const names = arr.map(s => (s?.nombre ?? '').toString().trim());
        if (!ids.length)
            return res.status(400).json({ error: "Debe venir al menos un solicitante" });
        const now = new Date();
        const result = await prisma.$transaction(async (tx) => {
            const updated = [];
            // 1️⃣ Actualizar la visita existente (primer solicitante)
            const u = await tx.visita.update({
                where: { id_visita: visitaId },
                data: {
                    ...payloadFlags,
                    otrosDetalle: otrosDetalleValidado,
                    solicitanteId: ids[0],
                    solicitante: names[0] || null,
                    fin: now,
                    status: client_1.EstadoVisita.COMPLETADA,
                    direccion_visita: direccion_visita || v.direccion_visita,
                    sucursalId: req.body.sucursalId ?? v.sucursalId ?? null,
                },
                select: {
                    id_visita: true, tecnicoId: true, empresaId: true, inicio: true, fin: true,
                    solicitanteId: true, solicitante: true, status: true,
                    ccleaner: true, actualizaciones: true, antivirus: true, estadoDisco: true,
                    licenciaWindows: true, licenciaOffice: true, rendimientoEquipo: true, mantenimientoReloj: true, ecografo: true,
                    direccion_visita: true, sucursalId: true,
                },
            });
            updated.push(u);
            // 2️⃣ Crear historial correspondiente
            await tx.historial.create({
                data: {
                    tecnicoId: u.tecnicoId,
                    solicitanteId: u.solicitanteId,
                    solicitante: u.solicitante,
                    inicio: u.inicio,
                    fin: u.fin,
                    realizado: (realizado ?? otrosDetalleValidado) ?? null,
                    direccion_visita: u.direccion_visita,
                    sucursalId: u.sucursalId ?? null,
                    ccleaner: u.ccleaner,
                    actualizaciones: u.actualizaciones,
                    antivirus: u.antivirus,
                    estadoDisco: u.estadoDisco,
                    licenciaWindows: u.licenciaWindows,
                    licenciaOffice: u.licenciaOffice,
                    rendimientoEquipo: u.rendimientoEquipo,
                    mantenimientoReloj: u.mantenimientoReloj,
                    ecografo: u.ecografo,
                },
            });
            // 3️⃣ Crear visitas adicionales para otros solicitantes
            for (let i = 1; i < ids.length; i++) {
                const nueva = await tx.visita.create({
                    data: {
                        tecnicoId: u.tecnicoId,
                        empresaId: u.empresaId,
                        inicio: v.inicio,
                        fin: now,
                        status: client_1.EstadoVisita.COMPLETADA,
                        ...payloadFlags,
                        otrosDetalle: otrosDetalleValidado,
                        solicitanteId: ids[i],
                        solicitante: names[i] || null,
                        direccion_visita: direccion_visita || v.direccion_visita,
                        sucursalId: req.body.sucursalId ?? v.sucursalId ?? null,
                    },
                    select: {
                        id_visita: true, tecnicoId: true, empresaId: true, inicio: true, fin: true,
                        solicitanteId: true, solicitante: true, status: true,
                        ccleaner: true, actualizaciones: true, antivirus: true, estadoDisco: true,
                        licenciaWindows: true, licenciaOffice: true, rendimientoEquipo: true, mantenimientoReloj: true, ecografo: true,
                        direccion_visita: true, sucursalId: true,
                    },
                });
                updated.push(nueva);
                await tx.historial.create({
                    data: {
                        tecnicoId: nueva.tecnicoId,
                        solicitanteId: nueva.solicitanteId,
                        solicitante: nueva.solicitante,
                        inicio: nueva.inicio,
                        fin: nueva.fin,
                        realizado: (realizado ?? otrosDetalleValidado) ?? null,
                        direccion_visita: nueva.direccion_visita,
                        sucursalId: req.body.sucursalId ?? v.sucursalId ?? null,
                        ccleaner: nueva.ccleaner,
                        actualizaciones: nueva.actualizaciones,
                        antivirus: nueva.antivirus,
                        estadoDisco: nueva.estadoDisco,
                        licenciaWindows: nueva.licenciaWindows,
                        licenciaOffice: nueva.licenciaOffice,
                        rendimientoEquipo: nueva.rendimientoEquipo,
                        mantenimientoReloj: nueva.mantenimientoReloj,
                        ecografo: nueva.ecografo,
                    },
                });
            }
            return updated;
        });
        return res.status(200).json({
            message: `Visita(s) completada(s) para ${ids.length} solicitante(s)`,
            visitas: result,
        });
    }
    catch (error) {
        console.error("Error al completar visita:", error);
        return res.status(500).json({
            error: `Error interno al completar la visita: ${error.message || error}`,
        });
    }
};
exports.completarVisita = completarVisita;
// GET /api/historial/:tecnicoId / Aceptar datos Null
// GET /api/historial/:tecnicoId?page=1&limit=10  - CON MANEJO DE SUCURSAL NULL + PAGINACIÓN
const obtenerHistorialPorTecnico = async (req, res) => {
    const tecnicoId = Number(req.params.id);
    if (Number.isNaN(tecnicoId)) {
        return res.status(400).json({ error: 'ID de técnico inválido' });
    }
    // ✅ Paginación (query params): page >= 1, limit entre 1 y 100
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit);
    const limit = Math.min(100, Math.max(1, Number.isNaN(limitRaw) ? 5 : limitRaw));
    const skip = (page - 1) * limit;
    try {
        // total + página actual en paralelo
        const [total, historial] = await Promise.all([
            prisma.historial.count({
                where: { tecnicoId },
            }),
            prisma.historial.findMany({
                where: { tecnicoId },
                orderBy: { fin: 'desc' },
                skip,
                take: limit,
                include: {
                    solicitanteRef: {
                        include: {
                            empresa: {
                                select: {
                                    id_empresa: true,
                                    nombre: true,
                                },
                            },
                        },
                    },
                    sucursal: {
                        select: {
                            id_sucursal: true,
                            nombre: true,
                        },
                    },
                },
            }),
        ]);
        // Mapeo seguro con manejo de sucursal null
        const safe = historial.map((h) => ({
            id: h.id,
            nombreCliente: h.solicitanteRef?.empresa?.nombre,
            inicio: h.inicio,
            fin: h.fin,
            realizado: h.realizado ?? '—',
            direccion_visita: h.direccion_visita ?? 'No registrada',
            nombreSolicitante: h.solicitante || h.solicitanteRef?.nombre || 'Solicitante no asignado',
            // ✅ Sucursal tomada directamente del historial (ya no desde el solicitante)
            sucursalId: h.sucursal?.id_sucursal ?? null,
            sucursalNombre: h.sucursal?.nombre ?? 'Sin sucursal asignada',
            tieneSucursal: !!h.sucursal,
        }));
        const lastItemIndex = skip + safe.length;
        const hasMore = lastItemIndex < total;
        const nextPage = hasMore ? page + 1 : null;
        // 🔁 Mantengo la clave "historial" y agrego metadatos de paginación
        return res.json({
            historial: safe,
            page,
            limit,
            total,
            hasMore,
            nextPage,
        });
    }
    catch (err) {
        console.error('[HISTORIAL] Error:', err);
        return res.status(500).json({
            message: 'Error consultando historial',
            name: err?.name,
            code: err?.code,
            meta: err?.meta,
        });
    }
};
exports.obtenerHistorialPorTecnico = obtenerHistorialPorTecnico;
//Carga masiva de solicitantes por empresa
const createManySolicitante = async (req, res) => {
    const { solicitantes } = req.body;
    if (!Array.isArray(solicitantes) || solicitantes.length === 0) {
        return res.status(400).json({ error: 'Debes enviar un arreglo de solicitantes' });
    }
    try {
        const result = await prisma.solicitante.createMany({
            data: solicitantes.map((s) => ({
                nombre: s.nombre,
                empresaId: s.empresaId
            })),
            skipDuplicates: true, // evita error si ya existe uno con mismos datos únicos
        });
        return res.status(201).json({
            message: `Se agregaron ${result.count} solicitante(s)`,
        });
    }
    catch (error) {
        console.error('Error al insertar solicitantes:', error);
        return res.status(500).json({ error: 'Error al insertar solicitantes' });
    }
};
exports.createManySolicitante = createManySolicitante;
const createManyEquipos = async (req, res) => {
    const { equipos } = req.body;
    if (!Array.isArray(equipos) || equipos.length === 0) {
        return res.status(400).json({ error: 'Debes enviar un arreglo de equipos' });
    }
    try {
        const result = await prisma.equipo.createMany({
            data: equipos.map((e) => ({
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
    }
    catch (error) {
        console.error('Error al insertar equipos:', error);
        return res.status(500).json({ error: 'Error al insertar equipos' });
    }
};
exports.createManyEquipos = createManyEquipos;
//GET /api/auth/getSolicitante
const getSolicitantes = async (req, res) => {
    try {
        const empresaId = req.query.empresaId;
        // Verificar que el parámetro 'empresaId' esté presente
        if (!empresaId) {
            return res.status(400).json({ error: "Falta el parámetro empresaId" });
        }
        // Convertir 'empresaId' a número y validar
        const empresaIdNumber = Number(empresaId);
        if (isNaN(empresaIdNumber)) {
            return res.status(400).json({ error: "El parámetro empresaId debe ser un número válido" });
        }
        // Realizar la consulta con el 'empresaId' validado
        const solicitantes = await prisma.solicitante.findMany({
            where: {
                empresaId: empresaIdNumber, // Usamos el 'empresaId' convertido a número
            },
            select: {
                id_solicitante: true,
                nombre: true,
                email: true,
                empresaId: true,
            },
        });
        return res.json({ solicitantes });
    }
    catch (error) {
        console.error("Error al obtener solicitantes:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};
exports.getSolicitantes = getSolicitantes;
const updateSolicitante = async (req, res) => {
    try {
        const solicitantes = req.body;
        if (!Array.isArray(solicitantes)) {
            return res.status(400).json({ error: "Debe proporcionar un array de solicitantes a actualizar." });
        }
        const updatedSolicitantes = [];
        for (const solicitante of solicitantes) {
            const { id_solicitante, email, telefono } = solicitante;
            if (!id_solicitante || !email) {
                return res.status(400).json({ error: "Faltan parámetros necesarios en uno de los solicitantes." });
            }
            // Verificar si el email ya está registrado en otro solicitante
            const emailExistente = await prisma.solicitante.findFirst({
                where: { email: email, NOT: { id_solicitante: id_solicitante } },
            });
            const solicitanteExistente = await prisma.solicitante.findUnique({
                where: { id_solicitante: id_solicitante },
            });
            if (!solicitanteExistente) {
                return res.status(404).json({ error: `Solicitante con ID ${id_solicitante} no encontrado.` });
            }
            const telefonoFinal = telefono === "" ? "" : telefono;
            try {
                const updatedSolicitante = await prisma.solicitante.update({
                    where: { id_solicitante: id_solicitante },
                    data: {
                        email: email,
                        telefono: telefonoFinal,
                    },
                });
                updatedSolicitantes.push(updatedSolicitante);
            }
            catch (error) {
                console.error("Error al actualizar solicitante con ID:", id_solicitante, error);
                return res.status(500).json({ error: `Error al actualizar solicitante con ID ${id_solicitante}` });
            }
        }
        return res.json({
            message: "Solicitantes actualizados correctamente",
            updatedSolicitantes,
        });
    }
    catch (error) {
        console.error("Error en el proceso de actualización de solicitantes:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};
exports.updateSolicitante = updateSolicitante;
//GET Auth/getAllEquipos
const getAllEquipos = async (req, res) => {
    try {
        const equipos = await prisma.equipo.findMany({
            select: {
                id_equipo: true,
                serial: true,
                marca: true,
                modelo: true,
                procesador: true,
                ram: true,
                disco: true,
                propiedad: true,
                equipo: {
                    select: { tipoDd: true },
                    orderBy: { id: 'desc' },
                    take: 1
                }
            }
        });
        // 🔹 Aplanar tipoDd (convertir array a valor directo)
        const equiposMap = equipos.map(eq => ({
            ...eq,
            tipoDd: eq.equipo[0]?.tipoDd ?? "S/A", // si no hay detalle, coloca S/A
        }));
        // 🔹 Eliminar la propiedad 'equipo' para no confundir al front
        equiposMap.forEach(eq => delete eq.equipo);
        return res.json({ equipos: equiposMap });
    }
    catch (e) {
        console.error("Error al obtener equipos", e);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};
exports.getAllEquipos = getAllEquipos;
const actualizarEquipo = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        // Aceptar ahora estas 4 llaves
        const { disco, procesador, ram, tipoDd } = req.body ?? {};
        const keys = Object.keys(req.body || {});
        const allowed = new Set(["disco", "procesador", "ram", "tipoDd"]);
        const extras = keys.filter(k => !allowed.has(k));
        if (extras.length) {
            return res.status(400).json({ error: `Campos no permitidos: ${extras.join(", ")}` });
        }
        if (typeof disco === "undefined" &&
            typeof procesador === "undefined" &&
            typeof ram === "undefined" &&
            typeof tipoDd === "undefined") {
            return res.status(400).json({ error: "No hay campos para actualizar" });
        }
        const norm = (v) => {
            if (typeof v === "undefined")
                return undefined;
            return String(v).trim();
        };
        // Verifica que el equipo exista (importante si solo viene tipoDd)
        const existe = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            select: { id_equipo: true }
        });
        if (!existe)
            return res.status(404).json({ error: "Equipo no encontrado" });
        const dataEquipo = {};
        const vDisco = norm(disco);
        const vProc = norm(procesador);
        const vRam = norm(ram);
        const vTipo = norm(tipoDd);
        if (typeof vDisco !== "undefined")
            dataEquipo.disco = vDisco;
        if (typeof vProc !== "undefined")
            dataEquipo.procesador = vProc;
        if (typeof vRam !== "undefined")
            dataEquipo.ram = vRam;
        const result = await prisma.$transaction(async (tx) => {
            // 1) Actualizar Equipo si corresponde
            const updatedEquipo = (Object.keys(dataEquipo).length > 0)
                ? await tx.equipo.update({
                    where: { id_equipo: id },
                    data: dataEquipo,
                    select: {
                        id_equipo: true, marca: true, modelo: true, serial: true,
                        disco: true, procesador: true, ram: true,
                    },
                })
                : await tx.equipo.findUnique({
                    where: { id_equipo: id },
                    select: {
                        id_equipo: true, marca: true, modelo: true, serial: true,
                        disco: true, procesador: true, ram: true,
                    },
                });
            // 2) Actualizar/crear DetalleEquipo.tipoDd si vino en el body
            let detalle = null;
            if (typeof vTipo !== "undefined") {
                // Tomamos el último detalle (por id desc). Si no hay, lo creamos.
                const last = await tx.detalleEquipo.findFirst({
                    where: { idEquipo: id },
                    orderBy: { id: "desc" },
                    select: { id: true },
                });
                if (last) {
                    detalle = await tx.detalleEquipo.update({
                        where: { id: last.id },
                        data: { tipoDd: vTipo },
                        select: { id: true, tipoDd: true },
                    });
                }
                else {
                    detalle = await tx.detalleEquipo.create({
                        data: { idEquipo: id, tipoDd: vTipo },
                        select: { id: true, tipoDd: true },
                    });
                }
            }
            return { updatedEquipo, detalle };
        });
        return res.status(200).json({
            message: "Equipo actualizado",
            equipo: result.updatedEquipo,
            detalleActualizado: result.detalle, // null si no se envió tipoDd
        });
    }
    catch (e) {
        if (e?.code === "P2025")
            return res.status(404).json({ error: "Equipo no encontrado" });
        console.error("Error al actualizar equipo:", e);
        return res.status(500).json({ error: "Error al actualizar equipo" });
    }
};
exports.actualizarEquipo = actualizarEquipo;
const createManyDetalle = async (req, res) => {
    const { detalles } = req.body;
    ;
    if (!Array.isArray(detalles) || detalles.length === 0) {
        return res.status(400).json({ error: 'Debes enviar un arreglo de detalles' });
    }
    try {
        // (Opcional) Valida/coacciona por si vienen como string desde JSON/CSV/form
        const data = detalles.map((e) => ({
            idEquipo: typeof e.idEquipo === 'string' ? Number(e.idEquipo) : e.idEquipo,
            macWifi: e.macWifi?.trim(),
            so: e.so?.trim(),
            tipoDd: e.tipoDd?.trim(),
            estadoAlm: e.estadoAlm?.trim(),
            office: e.office?.trim(),
            teamViewer: e.teamViewer?.trim(),
            claveTv: e.claveTv?.trim(),
            revisado: e.revisado?.trim(),
        }));
        const result = await prisma.detalleEquipo.createMany({
            data
        });
        return res.status(201).json({ message: `Se agregaron ${result.count} detalle(s)` });
    }
    catch (e) {
        console.error('Error al insertar detalles: ', e);
        return res.status(500).json({ error: JSON.stringify(e) });
    }
};
exports.createManyDetalle = createManyDetalle;
const createEquipo = async (req, res) => {
    const body = (req.body ?? {});
    // Validaciones mínimas (ajústalas a tus reglas de negocio)
    if (typeof body.idSolicitante !== 'number') {
        return res.status(400).json({ error: 'idSolicitante es requerido y debe ser número' });
    }
    if (!body.serial || !body.marca || !body.modelo) {
        return res.status(400).json({ error: 'serial, marca y modelo son requeridos' });
    }
    try {
        const equipo = await prisma.equipo.create({
            data: {
                idSolicitante: body.idSolicitante,
                serial: body.serial.trim(),
                marca: body.marca.trim(),
                modelo: body.modelo.trim(),
                procesador: body.procesador?.trim() ?? '',
                ram: body.ram?.trim() ?? '',
                disco: body.disco?.trim() ?? '',
                propiedad: body.propiedad?.trim() ?? '',
            },
        });
        return res.status(201).json({
            message: 'Equipo creado',
            equipo, // devolvemos el registro creado para que la UI pueda pintar el resultado
        });
    }
    catch (error) {
        // duplicados (por ejemplo, serial único)
        if (error?.code === 'P2002') {
            const fields = error.meta?.target;
            return res.status(409).json({ error: `Ya existe un equipo con ese valor único (${fields})` });
        }
        console.error('Error al crear equipo:', error);
        return res.status(500).json({ error: 'Error al crear equipo' });
    }
};
exports.createEquipo = createEquipo;
// POST /auth/createSolicitante 
const createSolicitante = async (req, res) => {
    try {
        const { nombre, empresaId, email, telefono, clienteId } = req.body;
        // Validaciones mínimas
        if (!nombre?.trim() || !empresaId) {
            return res.status(400).json({
                error: "El nombre y empresaId son obligatorios"
            });
        }
        // Preparar datos para crear
        const data = {
            nombre: nombre.trim(),
            empresaId: Number(empresaId),
            email: email?.trim() || null,
            telefono: telefono?.trim() || null,
        };
        // Solo incluir clienteId si se proporciona y es válido
        if (clienteId !== undefined && clienteId !== null && clienteId !== '') {
            data.clienteId = Number(clienteId);
        }
        // Crear el solicitante
        const solicitante = await prisma.solicitante.create({
            data,
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true
                    }
                }
            }
        });
        return res.status(201).json({
            message: "Solicitante creado correctamente",
            solicitante
        });
    }
    catch (error) {
        console.error("Error al crear solicitante:", error);
        if (error.code === 'P2002') {
            const target = error.meta?.target;
            if (target?.includes('clienteId')) {
                return res.status(400).json({
                    error: "El clienteId ya está en uso por otro solicitante"
                });
            }
            return res.status(400).json({ error: "Datos duplicados" });
        }
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "La empresa no existe" });
        }
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};
exports.createSolicitante = createSolicitante;
// Method Sucursales
// POST /api/sucursales
const crearSucursal = async (req, res) => {
    const { nombre, direccion, telefono, empresaId } = req.body;
    if (!empresaId || !nombre) {
        return res.status(400).json({ error: 'Debe indicar nombre y empresaId' });
    }
    try {
        const sucursal = await prisma.sucursal.create({
            data: { nombre, direccion, telefono, empresaId },
        });
        // marcar automáticamente a la empresa como que tiene sucursales
        await prisma.empresa.update({
            where: { id_empresa: empresaId },
            data: { tieneSucursales: true },
        });
        return res.json({ message: 'Sucursal creada correctamente', sucursal });
    }
    catch (error) {
        console.error('Error al crear sucursal:', error);
        return res.status(500).json({ error: 'Error interno al crear sucursal' });
    }
};
exports.crearSucursal = crearSucursal;
// GET /api/empresas/:id/sucursales
const obtenerSucursalesPorEmpresa = async (req, res) => {
    const empresaId = Number(req.params.id);
    if (isNaN(empresaId)) {
        return res.status(400).json({ error: 'ID de empresa inválido' });
    }
    try {
        const sucursales = await prisma.sucursal.findMany({
            where: { empresaId },
            orderBy: { nombre: 'asc' },
        });
        // ✅ En lugar de devolver 404, devolvemos 200 con lista vacía
        return res.json({
            sucursales,
            message: sucursales.length > 0
                ? 'Sucursales encontradas'
                : 'Esta empresa no tiene sucursales registradas'
        });
    }
    catch (error) {
        console.error('Error al obtener sucursales:', error);
        return res.status(500).json({ error: 'Error interno al obtener sucursales' });
    }
};
exports.obtenerSucursalesPorEmpresa = obtenerSucursalesPorEmpresa;
// GET /api/empresasConSucursales
const obtenerEmpresasConSucursales = async (req, res) => {
    try {
        const empresas = await prisma.empresa.findMany({
            where: { tieneSucursales: true },
            orderBy: { nombre: 'asc' },
            include: {
                sucursales: {
                    select: { id_sucursal: true, nombre: true, direccion: true },
                },
            },
        });
        return res.json({ empresas });
    }
    catch (error) {
        console.error('Error al obtener empresas con sucursales:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};
exports.obtenerEmpresasConSucursales = obtenerEmpresasConSucursales;
