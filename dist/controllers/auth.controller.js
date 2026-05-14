"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerEmpresasConSucursales = exports.obtenerSucursalesPorEmpresa = exports.crearSucursal = exports.createSolicitante = exports.createEquipo = exports.createManyDetalle = exports.cambiarSolicitanteEquipo = exports.actualizarEquipo = exports.getAllEquipos = exports.updateSolicitante = exports.getSolicitantes = exports.createManyEquipos = exports.createManySolicitante = exports.obtenerHistorialPorTecnico = exports.completarVisita = exports.crearVisita = exports.createManyempresa = exports.refresh = exports.logout = exports.getAllUsers = exports.loginMicrosoft = exports.login = exports.createCliente = exports.deleteCliente = exports.getAllClientes = exports.registerUser = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const argon2_1 = __importDefault(require("argon2"));
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
let microsoftKeysCache = null;
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
function getMicrosoftConfig() {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!tenantId || !clientId) {
        throw new Error("MICROSOFT_TENANT_ID y MICROSOFT_CLIENT_ID deben estar configurados");
    }
    return { clientId, tenantId };
}
async function getMicrosoftSigningKey(kid) {
    const now = Date.now();
    if (!microsoftKeysCache || microsoftKeysCache.expiresAt <= now) {
        const { tenantId } = getMicrosoftConfig();
        const response = await fetch(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
        if (!response.ok) {
            throw new Error("No se pudieron obtener las llaves publicas de Microsoft");
        }
        const data = await response.json();
        microsoftKeysCache = {
            expiresAt: now + 60 * 60 * 1000,
            keys: data.keys ?? [],
        };
    }
    const jwk = microsoftKeysCache.keys.find((key) => key.kid === kid);
    if (!jwk) {
        throw new Error("No se encontro la llave publica de Microsoft para validar el token");
    }
    return crypto_1.default.createPublicKey({ key: jwk, format: "jwk" }).export({
        format: "pem",
        type: "spki",
    });
}
function assertAllowedMicrosoftDomain(email) {
    const allowedDomains = (process.env.MICROSOFT_ALLOWED_DOMAINS ?? "")
        .split(",")
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean);
    if (!allowedDomains.length) {
        return;
    }
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || !allowedDomains.includes(domain)) {
        throw new Error("Dominio Microsoft no autorizado");
    }
}
async function verifyMicrosoftIdToken(idToken) {
    const decoded = jsonwebtoken_1.default.decode(idToken, { complete: true });
    const { clientId, tenantId } = getMicrosoftConfig();
    if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
        throw new Error("Token Microsoft invalido");
    }
    const publicKey = await getMicrosoftSigningKey(decoded.header.kid);
    const payload = jsonwebtoken_1.default.verify(idToken, publicKey, {
        algorithms: ["RS256"],
        audience: clientId,
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    });
    const email = (payload.preferred_username || payload.email || "").trim().toLowerCase();
    if (!email) {
        throw new Error("El token Microsoft no contiene correo");
    }
    assertAllowedMicrosoftDomain(email);
    return { email, microsoftUserId: payload.oid, name: payload.name };
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
            include: {
                detalleEmpresa: {
                    select: {
                        rut: true,
                    },
                },
            },
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
        let ok = false;
        const hash = user.passwordHash;
        if (hash.startsWith("$argon2")) {
            ok = await argon2_1.default.verify(hash, password);
        }
        else if (hash.startsWith("$2")) {
            ok = await bcrypt_1.default.compare(password, hash);
        }
        if (!ok) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }
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
// POST /auth/microsoft
const loginMicrosoft = async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ error: "Token Microsoft requerido" });
        }
        const microsoftUser = await verifyMicrosoftIdToken(idToken);
        const user = await prisma.tecnico.findUnique({
            where: { email: microsoftUser.email },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                status: true,
            },
        });
        if (!user || !user.status) {
            return res.status(403).json({
                error: "No existe un tecnico activo asociado a esta cuenta Microsoft",
            });
        }
        const at = signAccessToken({
            id: user.id_tecnico,
            email: user.email,
            nombreUsuario: user.nombre,
        });
        return res.json({ token: at, user });
    }
    catch (err) {
        console.error("microsoft login error:", err);
        return res.status(401).json({ error: "No se pudo iniciar sesion con Microsoft" });
    }
};
exports.loginMicrosoft = loginMicrosoft;
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
                    empresaId: u.empresaId,
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
                        empresaId: nueva.empresaId,
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
// GET /api/historial
const obtenerHistorialPorTecnico = async (req, res) => {
    const tecnicoId = req.user?.id;
    if (!tecnicoId) {
        return res.status(401).json({ error: "Técnico no autenticado" });
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit);
    const limit = Math.min(100, Math.max(1, Number.isNaN(limitRaw) ? 5 : limitRaw));
    const skip = (page - 1) * limit;
    try {
        const [total, historial] = await Promise.all([
            prisma.historial.count({
                where: { tecnicoId },
            }),
            prisma.historial.findMany({
                where: { tecnicoId },
                orderBy: { fin: "desc" },
                skip,
                take: limit,
                include: {
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                    solicitanteRef: {
                        select: {
                            id_solicitante: true,
                            nombre: true,
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
        return res.json({
            historial,
            page,
            limit,
            total,
            hasMore: skip + historial.length < total,
        });
    }
    catch (err) {
        console.error("[HISTORIAL] Error:", err);
        return res.status(500).json({ error: "Error consultando historial" });
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
                // 🔥 CLAVE
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
                        claveTv: true,
                        revisado: true,
                        adminRidsUsuario: true,
                        adminRidsPassword: true,
                        usuarioEmpresa: true,
                        passwordEmpresa: true,
                        usuarioPersonal: true,
                        passwordPersonal: true,
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
        const equiposMap = equipos.map(eq => {
            const detalle = eq.equipo[0];
            return {
                ...eq,
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
                adicionales: eq.adicionales ?? [],
                // 🔥 EXTRAS PARA EL FRONT
                empresaId: eq.solicitante?.empresaId ?? null,
                nombreSolicitante: eq.solicitante?.nombre ?? 'S/A',
            };
        });
        equiposMap.forEach(eq => delete eq.equipo);
        return res.json({ equipos: equiposMap });
    }
    catch (e) {
        console.error('Error al obtener equipos', e);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};
exports.getAllEquipos = getAllEquipos;
const actualizarEquipo = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const { serial, marca, modelo, disco, procesador, ram, propiedad, macWifi, redEthernet, so, tipoDd, estadoAlm, office, teamViewer, claveTv, revisado, adminRidsUsuario, adminRidsPassword, usuarioEmpresa, passwordEmpresa, usuarioPersonal, passwordPersonal, adicionales, } = req.body ?? {};
        const keys = Object.keys(req.body || {});
        const allowed = new Set([
            "serial",
            "marca",
            "modelo",
            "disco",
            "procesador",
            "ram",
            "propiedad",
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
        const norm = (v) => {
            if (typeof v === "undefined")
                return undefined;
            return String(v).trim();
        };
        const normNullable = (v) => {
            const value = norm(v);
            if (typeof value === "undefined")
                return undefined;
            return value || null;
        };
        // Verifica que el equipo exista (importante si solo viene tipoDd)
        const existe = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            select: { id_equipo: true }
        });
        if (!existe)
            return res.status(404).json({ error: "Equipo no encontrado" });
        const dataEquipo = {};
        const vSerial = norm(serial);
        const vMarca = norm(marca);
        const vModelo = norm(modelo);
        const vDisco = norm(disco);
        const vProc = norm(procesador);
        const vRam = norm(ram);
        const vPropiedad = norm(propiedad);
        if (typeof vSerial !== "undefined") {
            if (!vSerial)
                return res.status(400).json({ error: "serial no puede estar vacío" });
            dataEquipo.serial = vSerial;
        }
        if (typeof vMarca !== "undefined") {
            if (!vMarca)
                return res.status(400).json({ error: "marca no puede estar vacía" });
            dataEquipo.marca = vMarca;
        }
        if (typeof vModelo !== "undefined") {
            if (!vModelo)
                return res.status(400).json({ error: "modelo no puede estar vacío" });
            dataEquipo.modelo = vModelo;
        }
        if (typeof vDisco !== "undefined")
            dataEquipo.disco = vDisco;
        if (typeof vProc !== "undefined")
            dataEquipo.procesador = vProc;
        if (typeof vRam !== "undefined")
            dataEquipo.ram = vRam;
        if (typeof vPropiedad !== "undefined")
            dataEquipo.propiedad = vPropiedad;
        const detalleData = {
            macWifi: normNullable(macWifi),
            redEthernet: normNullable(redEthernet),
            so: normNullable(so),
            tipoDd: normNullable(tipoDd),
            estadoAlm: normNullable(estadoAlm),
            office: normNullable(office),
            teamViewer: normNullable(teamViewer),
            claveTv: normNullable(claveTv),
            revisado: normNullable(revisado),
            adminRidsUsuario: normNullable(adminRidsUsuario),
            adminRidsPassword: normNullable(adminRidsPassword),
            usuarioEmpresa: normNullable(usuarioEmpresa),
            passwordEmpresa: normNullable(passwordEmpresa),
            usuarioPersonal: normNullable(usuarioPersonal),
            passwordPersonal: normNullable(passwordPersonal),
        };
        const dataDetalle = Object.fromEntries(Object.entries(detalleData).filter(([, value]) => typeof value !== "undefined"));
        const adicionalesData = Array.isArray(adicionales)
            ? adicionales
                .filter((item) => typeof item?.tipo !== "undefined" && String(item.tipo).trim())
                .map((item) => ({
                tipo: String(item.tipo).trim(),
                descripcion: normNullable(item.descripcion),
                cantidad: Math.max(1, Number(item.cantidad) || 1),
                serialAdicional: normNullable(item.serialAdicional),
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
                    },
                })
                : await tx.equipo.findUnique({
                    where: { id_equipo: id },
                    select: {
                        id_equipo: true, marca: true, modelo: true, serial: true,
                        disco: true, procesador: true, ram: true, propiedad: true,
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
                }
                else {
                    detalle = await tx.detalleEquipo.create({
                        data: { idEquipo: id, ...dataDetalle },
                    });
                }
            }
            if (typeof adicionalesData !== "undefined") {
                await tx.equipoAdicional.deleteMany({ where: { equipoId: id } });
                if (adicionalesData.length > 0) {
                    await tx.equipoAdicional.createMany({
                        data: adicionalesData.map((item) => ({ ...item, equipoId: id })),
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
    }
    catch (e) {
        if (e?.code === "P2002") {
            const fields = e.meta?.target;
            return res.status(409).json({ error: `Ya existe un equipo con ese valor único (${fields})` });
        }
        if (e?.code === "P2025")
            return res.status(404).json({ error: "Equipo no encontrado" });
        console.error("Error al actualizar equipo:", e);
        return res.status(500).json({ error: "Error al actualizar equipo" });
    }
};
exports.actualizarEquipo = actualizarEquipo;
// PUT /auth/equipos/:id/solicitante
const cambiarSolicitanteEquipo = async (req, res) => {
    try {
        const equipoId = Number(req.params.id);
        const { solicitanteId } = req.body;
        if (!Number.isFinite(equipoId) || !Number.isFinite(Number(solicitanteId))) {
            return res.status(400).json({ error: "IDs inválidos" });
        }
        // Verificar que el equipo exista
        const equipo = await prisma.equipo.findUnique({
            where: { id_equipo: equipoId },
            select: { id_equipo: true }
        });
        if (!equipo) {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }
        // Verificar que el solicitante exista
        const solicitante = await prisma.solicitante.findUnique({
            where: { id_solicitante: Number(solicitanteId) },
            select: { id_solicitante: true }
        });
        if (!solicitante) {
            return res.status(404).json({ error: "Solicitante no encontrado" });
        }
        // Actualizar dueño del equipo
        const actualizado = await prisma.equipo.update({
            where: { id_equipo: equipoId },
            data: { idSolicitante: Number(solicitanteId) },
            select: {
                id_equipo: true,
                idSolicitante: true,
            }
        });
        return res.json({
            message: "Solicitante del equipo actualizado correctamente",
            equipo: actualizado,
        });
    }
    catch (error) {
        console.error("[CAMBIAR_SOLICITANTE_EQUIPO]", error);
        return res.status(500).json({ error: "Error interno al cambiar solicitante" });
    }
};
exports.cambiarSolicitanteEquipo = cambiarSolicitanteEquipo;
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
    const serial = body.serial.trim();
    const marca = body.marca.trim();
    const modelo = body.modelo.trim();
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
                    propiedad: body.propiedad?.trim() ?? '',
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
                revisado: body.revisado?.trim() || null,
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
                    tipo: item.tipo.trim(),
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
