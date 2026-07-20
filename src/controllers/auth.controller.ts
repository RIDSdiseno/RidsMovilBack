import type { Request, Response } from "express";
import { EstadoAgenda, EstadoVisita, OrigenGestioo, OrigenVisita, Prisma, TipoEntidadGestioo } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Secret } from "jsonwebtoken";
import crypto from "crypto";

import argon2 from "argon2";
import { prisma } from "../lib/prisma.js";

/* =========================
   CONFIG / CONSTANTES
========================= */

// JWT para Access Token (corto)
const JWT_SECRET: Secret = process.env.JWT_SECRET ?? "dev_secret"; // ⚠️ cambia en prod
const ACCESS_EXPIRES_SEC = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 180 * 60); // 15 min

// Refresh Token (cookie) duración
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS ?? 7);                   // sin "recordarme"
const REFRESH_REMEMBER_DAYS = Number(process.env.REFRESH_REMEMBER_DAYS ?? 60); // con "recordarme"

// Cookies (ajusta en prod)
const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? "false") === "true";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") ?? "lax";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
// 👇 muy importante si tus rutas están bajo /api/auth
const COOKIE_PATH = process.env.COOKIE_PATH ?? "/api/auth";


/* =========================
   TIPOS
========================= */
type JwtPayload = {
  id: number;
  email: string;       // derivado de nivel
  nombreUsuario: string;
};

type MicrosoftTokenPayload = {
  aud?: string;
  email?: string;
  iss?: string;
  name?: string;
  oid?: string;
  preferred_username?: string;
  tid?: string;
};

type MicrosoftJwk = {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
};

let microsoftKeysCache: { expiresAt: number; keys: MicrosoftJwk[] } | null = null;

function parseDateOrNow(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getChileDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getDateRangeFromChileKey(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getChileTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return { hour, minute };
}

function getChileMinutesFromMidnight(date = new Date()) {
  const { hour, minute } = getChileTimeParts(date);
  return hour * 60 + minute;
}

function getAgendaDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseHoraProgramada(value: string | null | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return {
    hour,
    minute,
    minutes: hour * 60 + minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function formatMinutesAsTime(minutes: number) {
  const normalized = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseJsonCoordinates(value: unknown): { latitud: number | null; longitud: number | null; direccion?: string | null } {
  const isRecord = (item: unknown): item is Record<string, unknown> =>
    typeof item === "object" && item !== null && !Array.isArray(item);

  const toNumber = (item: unknown) => {
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "string" && item.trim()) {
      const parsed = Number(item.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const readFromRecord = (item: Record<string, unknown>) => {
    const latitud =
      toNumber(item.latitud) ??
      toNumber(item.latitude) ??
      toNumber(item.lat) ??
      toNumber(item.y);
    const longitud =
      toNumber(item.longitud) ??
      toNumber(item.longitude) ??
      toNumber(item.lng) ??
      toNumber(item.lon) ??
      toNumber(item.x);

    if (latitud === null || longitud === null) return null;

    const direccion =
      typeof item.direccion === "string"
        ? item.direccion
        : typeof item.address === "string"
          ? item.address
          : null;

    return { latitud, longitud, direccion };
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const result = readFromRecord(item);
      if (result) return result;
    }
  }

  if (isRecord(value)) {
    const direct = readFromRecord(value);
    if (direct) return direct;

    for (const item of Object.values(value)) {
      const nested = parseJsonCoordinates(item);
      if (nested.latitud !== null && nested.longitud !== null) return nested;
    }
  }

  return { latitud: null, longitud: null };
}


/* =========================
   HELPERS
========================= */

// Access Token (JWT)
function signAccessToken(payload: JwtPayload, expiresInSec = ACCESS_EXPIRES_SEC) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
}

// Refresh Token aleatorio + hash SHA-256 (se guarda sólo el hash)
function generateRT(): string {
  return crypto.randomBytes(64).toString("base64url");
}
function hashRT(rt: string): string {
  return crypto.createHash("sha256").update(rt).digest("hex");
}

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function parseRemember(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

function setRefreshCookie(res: Response, rt: string, days: number) {
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
function clearRefreshCookie(res: Response) {
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

async function getMicrosoftSigningKey(kid: string) {
  const now = Date.now();

  if (!microsoftKeysCache || microsoftKeysCache.expiresAt <= now) {
    const { tenantId } = getMicrosoftConfig();
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);

    if (!response.ok) {
      throw new Error("No se pudieron obtener las llaves publicas de Microsoft");
    }

    const data = await response.json() as { keys?: MicrosoftJwk[] };
    microsoftKeysCache = {
      expiresAt: now + 60 * 60 * 1000,
      keys: data.keys ?? [],
    };
  }

  const jwk = microsoftKeysCache.keys.find((key) => key.kid === kid);

  if (!jwk) {
    throw new Error("No se encontro la llave publica de Microsoft para validar el token");
  }

  return crypto.createPublicKey({ key: jwk, format: "jwk" }).export({
    format: "pem",
    type: "spki",
  });
}

function assertAllowedMicrosoftDomain(email: string) {
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

async function verifyMicrosoftIdToken(idToken: string) {
  const decoded = jwt.decode(idToken, { complete: true });
  const { clientId, tenantId } = getMicrosoftConfig();

  if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
    throw new Error("Token Microsoft invalido");
  }

  const publicKey = await getMicrosoftSigningKey(decoded.header.kid);
  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    audience: clientId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  }) as MicrosoftTokenPayload;

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
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { nombre, email, password } = req.body;

    //validaciones basicas
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" })
    }

    //Se normaliza el email
    const emailNorm = String(email).trim().toLowerCase();
    const existing = await prisma.tecnico.findUnique({ where: { email: emailNorm } });
    if (existing) return res.status(409).json({ error: "Usuario ya existe" });

    const passwordHash = await bcrypt.hash(password, 10);
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
  } catch (error) {
    console.error("Register error", error);
    return res.status(500).json({ error: "Error interno" });
  }

};

//GET /Auth/getAllClientes
export const getAllClientes = async (req: Request, res: Response) => {
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
  } catch (e) {
    console.error("Error al obtener categorias: ", JSON.stringify(e));
    return res.status(500).json({ error: "Error interno" });
  }
};

function normalizeRutGestioo(value?: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (!clean) return null;
  if (clean.length <= 1) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

function rutKey(value?: string | null) {
  return (value ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function mapEntidadEconnetToCliente(entidad: {
  correo: string | null;
  direccion: string | null;
  id: number;
  nombre: string;
  rut: string | null;
  telefono: string | null;
}) {
  return {
    id_empresa: entidad.id,
    nombre: entidad.nombre,
    razonSocial: entidad.nombre,
    detalleEmpresa: {
      rut: entidad.rut,
    },
    correo: entidad.correo,
    telefono: entidad.telefono,
    direccion: entidad.direccion,
    origen: "ECONNET",
    tieneSucursales: false,
  };
}

export const getClientesEconnet = async (_req: Request, res: Response) => {
  try {
    const entidades = await prisma.entidadGestioo.findMany({
      where: {
        origen: OrigenGestioo.ECONNET,
        tipo: TipoEntidadGestioo.EMPRESA,
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        rut: true,
        correo: true,
        telefono: true,
        direccion: true,
      },
    });

    return res.json(entidades.map(mapEntidadEconnetToCliente));
  } catch (error) {
    console.error("Error al obtener clientes Econnet:", error);
    return res.status(500).json({ error: "Error interno" });
  }
};

export const createClienteEconnet = async (req: Request, res: Response) => {
  try {
    const nombre = String(req.body?.nombre || "").trim().replace(/\s+/g, " ").toUpperCase();
    const rut = normalizeRutGestioo(req.body?.rut);
    const correo = String(req.body?.correo || "").trim().toLowerCase() || null;
    const telefono = String(req.body?.telefono || "").trim() || null;
    const direccion = String(req.body?.direccion || "").trim() || null;

    if (!nombre) {
      return res.status(400).json({ error: "El nombre de la empresa es obligatorio" });
    }

    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ error: "Correo inválido" });
    }

    if (rut) {
      const entidadesConRut = await prisma.entidadGestioo.findMany({
        where: { rut: { not: null } },
        select: { id: true, nombre: true, rut: true },
      });
      const existente = entidadesConRut.find((entidad) => rutKey(entidad.rut) === rutKey(rut));

      if (existente) {
        return res.status(409).json({ error: `Ya existe una empresa con este RUT: ${existente.nombre}` });
      }
    }

    const entidad = await prisma.entidadGestioo.create({
      data: {
        nombre,
        rut,
        correo,
        telefono,
        direccion,
        tipo: TipoEntidadGestioo.EMPRESA,
        origen: OrigenGestioo.ECONNET,
      },
      select: {
        id: true,
        nombre: true,
        rut: true,
        correo: true,
        telefono: true,
        direccion: true,
      },
    });

    return res.status(201).json(mapEntidadEconnetToCliente(entidad));
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "El RUT ya está registrado" });
    }

    console.error("Error al crear cliente Econnet:", error);
    return res.status(500).json({ error: "Error interno" });
  }
};

//DELETE /Auth/deleteCliente
export const deleteCliente = async (req: Request, res: Response) => {
  const { id } = req.body; // Ahora lees del body
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  try {
    await prisma.empresa.delete({ where: { id_empresa: Number(id) } });
    return res.status(204).send();
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    return res.status(500).json({ error: "Error interno" });
  }
};

//POST /Auth/createCliente
export const createCliente = async (req: Request, res: Response) => {
  const { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "El nombre de cliente es obligatorio" });
  }

  try {
    const cliente = await prisma.empresa.create({ data: { nombre } });
    return res.status(201).json(cliente);
  } catch (e) {
    console.error("Error al crear cliente: ", JSON.stringify(e));
    return res.status(500).json({ error: "Error interno" })
  }
}


//POST /auth/login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, remember } = req.body as {
      email?: string;
      password?: string;
      remember?: boolean;
    };

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
      await bcrypt.compare(password, "$2b$10$invalidinvalidinvalidinvalidinv12345678901234567890");
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    let ok = false;
    const hash = user.passwordHash;

    if (hash.startsWith("$argon2")) {
      ok = await argon2.verify(hash, password);
    } else if (hash.startsWith("$2")) {
      ok = await bcrypt.compare(password, hash);
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

    const rt = generateRT();         // valor que va a cookie
    const rtDigest = hashRT(rt);     // hash que guardamos en DB

    // userAgent / ip como string | null (no undefined)
    const userAgent: string | null = req.get("user-agent") ?? null;
    const ip: string | null = (req.ip ?? req.socket?.remoteAddress ?? null) as string | null;

    await prisma.refreshToken.create({
      data: {
        userId: user.id_tecnico,
        rtHash: rtDigest,
        expiresAt: addDays(days),
        userAgent, // string | null
        ip,        // string | null
      },
    });

    // Setear cookie httpOnly
    setRefreshCookie(res, rt, days);

    const { passwordHash, ...safeUser } = user;
    return res.json({ token: at, user: { ...safeUser }, remember: rememberFlag });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};

// POST /auth/microsoft
export const loginMicrosoft = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body as { idToken?: string };

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
  } catch (err) {
    console.error("microsoft login error:", err);
    return res.status(401).json({ error: "No se pudo iniciar sesion con Microsoft" });
  }
};


export const getAllUsers = async (_req: Request, res: Response) => {
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
  } catch (error) {
    console.error("Error al obtener usuarios: ", JSON.stringify(error));
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// POST /auth/logout
export const logout = async (req: Request, res: Response) => {
  try {
    const rt = (req as any).cookies?.rt as string | undefined;
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
  } catch (error) {
    console.error("logout error:", error);
    return res.status(500).json({ error: "Error interno" });
  }
};

// POST /auth/refresh
// Valida por COOKIE httpOnly `rt`, rota el RT y devuelve nuevo Access Token
export const refresh = async (req: Request, res: Response) => {
  try {
    const rt = (req as any).cookies?.rt as string | undefined;
    if (!rt) return res.status(401).json({ error: "Sin refresh token" });

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
    const ua: string | null = req.get("user-agent") ?? null;
    const ipAddr: string | null = (req.ip ?? req.socket?.remoteAddress ?? null) as string | null;

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
          userAgent: ua,   // string | null
          ip: ipAddr,      // string | null
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
  } catch (e) {
    console.error("refresh error:", e);
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Refresh inválido" });
  }
};


//Carga masiva de empresa
export const createManyempresa = async (req: Request, res: Response) => {
  const { empresa } = req.body;

  if (!Array.isArray(empresa) || empresa.length === 0) {
    return res.status(400).json({ error: "Debes enviar un arreglo de empresa" });
  }

  try {
    const result = await prisma.empresa.createMany({
      data: empresa.map((e: { nombre: string }) => ({ nombre: e.nombre })),
      skipDuplicates: true, // evita error si alguna ya existe
    });

    return res.status(201).json({
      message: `Se agregaron ${result.count} empresas`,
    });
  } catch (error: any) {
    console.error("Error al insertar empresa:", error);
    return res.status(500).json({ error: "Error al insertar empresa" });
  }
};

function mapAgendaAsignada(
  visita: {
    id: number;
    fecha: Date;
    empresaId: number | null;
    estado: EstadoAgenda;
    notas: string | null;
    horaInicio: string | null;
    horaFin: string | null;
    mensaje: string | null;
    fechaInicioRuta: Date | null;
    fechaInicioVisita: Date | null;
    empresaExternaNombre: string | null;
    visita?: {
      id_visita: number;
      status: EstadoVisita;
      origen: OrigenVisita;
    } | null;
  },
  empresa?: {
    id_empresa: number;
    nombre: string;
    razonSocial: string | null;
    detalleEmpresa: {
      rut: string;
      direccion: string | null;
      direcciones: Prisma.JsonValue | null;
    } | null;
  }
) {
  const coords = parseJsonCoordinates(empresa?.detalleEmpresa?.direcciones ?? null);
  const direccion = coords.direccion ?? empresa?.detalleEmpresa?.direccion ?? null;
  const inconsistenciaEstado =
    visita.visita?.status === EstadoVisita.COMPLETADA &&
    visita.estado !== EstadoAgenda.COMPLETADA
      ? "VISITA_COMPLETADA_AGENDA_NO_COMPLETADA"
      : null;

  return {
    id: visita.id,
    agendaId: visita.id,
    empresa: empresa
      ? {
        id_empresa: empresa.id_empresa,
        nombre: empresa.nombre,
        razonSocial: empresa.razonSocial,
        rut: empresa.detalleEmpresa?.rut ?? null,
      }
      : visita.empresaExternaNombre
        ? {
          id_empresa: null,
          nombre: visita.empresaExternaNombre,
          razonSocial: null,
          rut: null,
        }
        : null,
    sucursal: null,
    direccion,
    latitud: coords.latitud,
    longitud: coords.longitud,
    fechaProgramada: visita.fecha.toISOString().slice(0, 10),
    horaProgramada: visita.horaInicio,
    horaInicio: visita.horaInicio,
    horaFin: visita.horaFin,
    estado: visita.estado,
    observacion: visita.notas ?? visita.mensaje,
    fechaInicioRuta: visita.fechaInicioRuta,
    fechaInicioVisita: visita.fechaInicioVisita,
    visitaId: visita.visita?.id_visita ?? null,
    visitaStatus: visita.visita?.status ?? null,
    visitaOrigen: visita.visita?.origen ?? null,
    inconsistenciaEstado,
  };
}

function cargarEmpresaAgenda(empresaId: number | null) {
  return empresaId
    ? prisma.empresa.findUnique({
      where: { id_empresa: empresaId },
      select: {
        id_empresa: true,
        nombre: true,
        razonSocial: true,
        detalleEmpresa: {
          select: {
            rut: true,
            direccion: true,
            direcciones: true,
          },
        },
      },
    })
    : Promise.resolve(null);
}

export const obtenerMisVisitasAsignadasHoy = async (req: Request, res: Response) => {
  try {
    const tecnicoId = req.user?.id;
    if (!tecnicoId) return res.status(401).json({ error: "No autenticado" });

    const dateKey = typeof req.query.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)
      ? req.query.fecha
      : getChileDateKey();
    const { start, end } = getDateRangeFromChileKey(dateKey);

    const asignaciones = await prisma.agendaTecnico.findMany({
      where: { tecnicoId },
      select: { agendaId: true },
    });
    const agendaIds = asignaciones.map((item) => item.agendaId);

    if (!agendaIds.length) {
      return res.json({ fecha: dateKey, visitas: [] });
    }

    const visitas = await prisma.agendaVisita.findMany({
      where: {
        id: { in: agendaIds },
        fecha: { gte: start, lt: end },
      },
      orderBy: [
        { horaInicio: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        fecha: true,
        empresaId: true,
        estado: true,
        notas: true,
        horaInicio: true,
        horaFin: true,
        mensaje: true,
        fechaInicioRuta: true,
        fechaInicioVisita: true,
        empresaExternaNombre: true,
        visita: {
          select: {
            id_visita: true,
            status: true,
            origen: true,
          },
        },
      },
    });

    const empresaIds = visitas
      .map((visita) => visita.empresaId)
      .filter((id): id is number => Number.isFinite(id));

    const empresas = empresaIds.length
      ? await prisma.empresa.findMany({
        where: { id_empresa: { in: empresaIds } },
        select: {
          id_empresa: true,
          nombre: true,
          razonSocial: true,
          detalleEmpresa: {
            select: {
              rut: true,
              direccion: true,
              direcciones: true,
            },
          },
        },
      })
      : [];

    const empresasById = new Map(empresas.map((empresa) => [empresa.id_empresa, empresa]));
    const data = visitas.map((visita) =>
      mapAgendaAsignada(visita, visita.empresaId ? empresasById.get(visita.empresaId) : undefined),
    );

    return res.json({ fecha: dateKey, visitas: data });
  } catch (error: any) {
    console.error("Error al obtener visitas asignadas:", error);
    return res.status(500).json({
      error: `Error interno al obtener visitas asignadas: ${error.message || error}`,
    });
  }
};

export const obtenerVisitaDeAgenda = async (req: Request, res: Response) => {
  try {
    const tecnicoId = req.user?.id;
    const agendaId = Number(req.params.id);

    if (!tecnicoId) return res.status(401).json({ error: "No autenticado" });
    if (!Number.isFinite(agendaId)) return res.status(400).json({ error: "ID de visita inválido" });

    const asignacion = await prisma.agendaTecnico.findUnique({
      where: {
        agendaId_tecnicoId: {
          agendaId,
          tecnicoId,
        },
      },
      select: { agendaId: true },
    });

    if (!asignacion) {
      return res.status(403).json({ error: "No puedes consultar una visita que no te pertenece." });
    }

    const visita = await prisma.visita.findUnique({
      where: { agendaId },
      select: {
        id_visita: true,
        empresaId: true,
        tecnicoId: true,
        sucursalId: true,
        inicio: true,
        fin: true,
        status: true,
        direccion_visita: true,
        agendaId: true,
        origen: true,
      },
    });

    return res.json({ visita });
  } catch (error: any) {
    console.error("Error al obtener visita de agenda:", error);
    return res.status(500).json({
      error: `Error interno al obtener visita de agenda: ${error.message || error}`,
    });
  }
};

export const iniciarRutaAgendaVisita = async (req: Request, res: Response) => {
  try {
    const tecnicoId = req.user?.id;
    const agendaId = Number(req.params.id);

    if (!tecnicoId) return res.status(401).json({ error: "No autenticado" });
    if (!Number.isFinite(agendaId)) return res.status(400).json({ error: "ID de visita inválido" });

    const asignacion = await prisma.agendaTecnico.findUnique({
      where: {
        agendaId_tecnicoId: {
          agendaId,
          tecnicoId,
        },
      },
      select: { agendaId: true },
    });

    if (!asignacion) {
      return res.status(403).json({ error: "No puedes iniciar ruta para una visita que no te pertenece." });
    }

    const visita = await prisma.agendaVisita.findUnique({
      where: { id: agendaId },
      select: {
        id: true,
        fecha: true,
        empresaId: true,
        estado: true,
        notas: true,
        horaInicio: true,
        horaFin: true,
        mensaje: true,
        fechaInicioRuta: true,
        fechaInicioVisita: true,
        empresaExternaNombre: true,
        visita: {
          select: {
            id_visita: true,
            status: true,
            origen: true,
          },
        },
      },
    });

    if (!visita) return res.status(404).json({ error: "Visita asignada no encontrada" });

    if (visita.visita?.status === EstadoVisita.COMPLETADA) {
      return res.status(409).json({
        error: "El formulario de esta visita ya está completado. La agenda debe cerrarse antes de iniciar otra ruta.",
        code: "AGENDA_CIERRE_PENDIENTE",
      });
    }

    if (visita.estado === EstadoAgenda.COMPLETADA || visita.estado === EstadoAgenda.CANCELADA) {
      return res.status(409).json({ error: "No puedes iniciar ruta en una visita finalizada o cancelada." });
    }

    if (visita.estado === EstadoAgenda.INICIADA) {
      return res.status(409).json({ error: "La visita ya fue iniciada." });
    }

    if (visita.estado === EstadoAgenda.EN_RUTA) {
      const empresa = await cargarEmpresaAgenda(visita.empresaId);
      return res.json({
        visita: mapAgendaAsignada(visita, empresa ?? undefined),
      });
    }

    const hoyChile = getChileDateKey();
    const fechaVisita = getAgendaDateKey(visita.fecha);

    if (fechaVisita !== hoyChile) {
      return res.status(403).json({ error: "Solo puedes iniciar ruta el día de la visita." });
    }

    const horaProgramada = parseHoraProgramada(visita.horaInicio);
    if (!horaProgramada) {
      return res.status(400).json({ error: "La visita no tiene una hora programada válida para iniciar ruta." });
    }

    const inicioPermitido = Math.max(0, horaProgramada.minutes - 60);
    const minutosChileAhora = getChileMinutesFromMidnight();

    if (minutosChileAhora < inicioPermitido) {
      return res.status(403).json({
        error: `Puedes iniciar ruta desde ${formatMinutesAsTime(inicioPermitido)}.`,
      });
    }

    const actualizada = await prisma.agendaVisita.update({
      where: { id: agendaId },
      data: {
        estado: EstadoAgenda.EN_RUTA,
        fechaInicioRuta: new Date(),
      },
      select: {
        id: true,
        fecha: true,
        empresaId: true,
        estado: true,
        notas: true,
        horaInicio: true,
        horaFin: true,
        mensaje: true,
        fechaInicioRuta: true,
        fechaInicioVisita: true,
        empresaExternaNombre: true,
      },
    });

    const empresa = await cargarEmpresaAgenda(actualizada.empresaId);

    return res.json({
      visita: mapAgendaAsignada(actualizada, empresa ?? undefined),
    });
  } catch (error: any) {
    console.error("Error al iniciar ruta:", error);
    return res.status(500).json({
      error: `Error interno al iniciar ruta: ${error.message || error}`,
    });
  }
};

export const iniciarVisitaAgendaVisita = async (req: Request, res: Response) => {
  try {
    const tecnicoId = req.user?.id;
    const agendaId = Number(req.params.id);

    if (!tecnicoId) return res.status(401).json({ error: "No autenticado" });
    if (!Number.isFinite(agendaId)) return res.status(400).json({ error: "ID de visita inválido" });

    const asignacion = await prisma.agendaTecnico.findUnique({
      where: {
        agendaId_tecnicoId: {
          agendaId,
          tecnicoId,
        },
      },
      select: { agendaId: true },
    });

    if (!asignacion) {
      return res.status(403).json({ error: "No puedes iniciar una visita que no te pertenece." });
    }

    const visita = await prisma.agendaVisita.findUnique({
      where: { id: agendaId },
      select: {
        id: true,
        fecha: true,
        empresaId: true,
        estado: true,
        notas: true,
        horaInicio: true,
        horaFin: true,
        mensaje: true,
        fechaInicioRuta: true,
        fechaInicioVisita: true,
        empresaExternaNombre: true,
      },
    });

    if (!visita) return res.status(404).json({ error: "Visita asignada no encontrada" });

    if (visita.estado === EstadoAgenda.COMPLETADA || visita.estado === EstadoAgenda.CANCELADA) {
      return res.status(409).json({ error: "No puedes iniciar una visita finalizada o cancelada." });
    }

    if (visita.estado === EstadoAgenda.PROGRAMADA || visita.estado === EstadoAgenda.NOTIFICADA) {
      return res.status(409).json({ error: "Debes iniciar ruta antes de iniciar la visita." });
    }

    if (visita.estado === EstadoAgenda.INICIADA) {
      const empresa = await cargarEmpresaAgenda(visita.empresaId);
      return res.json({
        visita: mapAgendaAsignada(visita, empresa ?? undefined),
      });
    }

    if (visita.estado !== EstadoAgenda.EN_RUTA) {
      return res.status(409).json({ error: "Debes iniciar ruta antes de iniciar la visita." });
    }

    const actualizada = await prisma.agendaVisita.update({
      where: { id: agendaId },
      data: {
        estado: EstadoAgenda.INICIADA,
        fechaInicioVisita: visita.fechaInicioVisita ?? new Date(),
      },
      select: {
        id: true,
        fecha: true,
        empresaId: true,
        estado: true,
        notas: true,
        horaInicio: true,
        horaFin: true,
        mensaje: true,
        fechaInicioRuta: true,
        fechaInicioVisita: true,
        empresaExternaNombre: true,
      },
    });

    const empresa = await cargarEmpresaAgenda(actualizada.empresaId);

    return res.json({
      visita: mapAgendaAsignada(actualizada, empresa ?? undefined),
    });
  } catch (error: any) {
    console.error("Error al iniciar visita:", error);
    return res.status(500).json({
      error: `Error interno al iniciar visita: ${error.message || error}`,
    });
  }
};

export const finalizarAgendaVisita = async (req: Request, res: Response) => {
  try {
    const tecnicoId = req.user?.id;
    const agendaId = Number(req.params.id);

    if (!tecnicoId) return res.status(401).json({ error: "No autenticado" });
    if (!Number.isFinite(agendaId)) return res.status(400).json({ error: "ID de visita inválido" });

    const asignacion = await prisma.agendaTecnico.findUnique({
      where: {
        agendaId_tecnicoId: {
          agendaId,
          tecnicoId,
        },
      },
      select: { agendaId: true },
    });

    if (!asignacion) {
      return res.status(403).json({ error: "No puedes finalizar una visita que no te pertenece." });
    }

    const visita = await prisma.agendaVisita.findUnique({
      where: { id: agendaId },
      select: {
        id: true,
        fecha: true,
        empresaId: true,
        estado: true,
        notas: true,
        horaInicio: true,
        horaFin: true,
        mensaje: true,
        fechaInicioRuta: true,
        fechaInicioVisita: true,
        empresaExternaNombre: true,
        visita: {
          select: {
            id_visita: true,
            status: true,
            origen: true,
            agendaId: true,
          },
        },
      },
    });

    if (!visita) return res.status(404).json({ error: "Visita asignada no encontrada" });

    if (visita.estado === EstadoAgenda.COMPLETADA) {
      const empresa = await cargarEmpresaAgenda(visita.empresaId);
      return res.json({
        visita: mapAgendaAsignada(visita, empresa ?? undefined),
      });
    }

    if (visita.estado === EstadoAgenda.CANCELADA) {
      return res.status(409).json({ error: "No puedes finalizar una visita cancelada." });
    }

    const formulario = visita.visita ?? await prisma.visita.findUnique({
      where: { agendaId },
      select: {
        id_visita: true,
        status: true,
        origen: true,
        agendaId: true,
      },
    });

    if (!formulario) {
      return res.status(409).json({
        error: "No existe un formulario de visita asociado a esta agenda.",
      });
    }

    if (formulario.agendaId !== agendaId) {
      return res.status(409).json({
        error: "El formulario de visita no corresponde a esta agenda.",
      });
    }

    if (formulario.status === EstadoVisita.PENDIENTE) {
      return res.status(409).json({
        error: "El formulario de visita debe estar completado antes de cerrar la agenda.",
      });
    }

    if (formulario.status !== EstadoVisita.COMPLETADA) {
      return res.status(409).json({
        error: "El formulario de visita debe estar completado antes de cerrar la agenda.",
      });
    }

    if (
      visita.estado !== EstadoAgenda.INICIADA &&
      visita.estado !== EstadoAgenda.PROGRAMADA &&
      visita.estado !== EstadoAgenda.NOTIFICADA &&
      visita.estado !== EstadoAgenda.EN_RUTA
    ) {
      return res.status(409).json({ error: "La agenda no se puede finalizar desde su estado actual." });
    }

    if (visita.estado !== EstadoAgenda.INICIADA) {
      console.warn(
        `[AGENDA] Reparando agenda #${agendaId}: formulario #${formulario.id_visita} COMPLETADA con agenda ${visita.estado}.`,
      );
    }

    const actualizada = await prisma.agendaVisita.update({
      where: { id: agendaId },
      data: {
        estado: EstadoAgenda.COMPLETADA,
      },
      select: {
        id: true,
        fecha: true,
        empresaId: true,
        estado: true,
        notas: true,
        horaInicio: true,
        horaFin: true,
        mensaje: true,
        fechaInicioRuta: true,
        fechaInicioVisita: true,
        empresaExternaNombre: true,
        visita: {
          select: {
            id_visita: true,
            status: true,
            origen: true,
          },
        },
      },
    });

    const empresa = await cargarEmpresaAgenda(actualizada.empresaId);

    return res.json({
      visita: mapAgendaAsignada(actualizada, empresa ?? undefined),
    });
  } catch (error: any) {
    console.error("Error al finalizar visita de agenda:", error);
    return res.status(500).json({
      error: `Error interno al finalizar visita de agenda: ${error.message || error}`,
    });
  }
};

export const registrarUbicacionTecnico = async (req: Request, res: Response) => {
  try {
    const tecnicoId = req.user?.id;
    if (!tecnicoId) return res.status(401).json({ error: "No autenticado" });

    const {
      agendaId,
      latitud,
      longitud,
      precision,
      velocidad,
      estadoTracking,
    } = req.body ?? {};

    const lat = Number(latitud);
    const lon = Number(longitud);
    const parsedAgendaId = agendaId === undefined || agendaId === null || agendaId === ""
      ? null
      : Number(agendaId);
    const parsedPrecision = precision === undefined || precision === null ? null : Number(precision);
    const parsedVelocidad = velocidad === undefined || velocidad === null ? null : Number(velocidad);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ error: "latitud inválida" });
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "longitud inválida" });
    }

    if (parsedAgendaId !== null && !Number.isFinite(parsedAgendaId)) {
      return res.status(400).json({ error: "agendaId inválido" });
    }

    if (parsedPrecision !== null && !Number.isFinite(parsedPrecision)) {
      return res.status(400).json({ error: "precision inválida" });
    }

    if (parsedVelocidad !== null && !Number.isFinite(parsedVelocidad)) {
      return res.status(400).json({ error: "velocidad inválida" });
    }

    const tecnico = await prisma.tecnico.findUnique({
      where: { id_tecnico: tecnicoId },
      select: { id_tecnico: true, status: true },
    });

    if (!tecnico || !tecnico.status) {
      return res.status(404).json({ error: "Técnico no encontrado o inactivo" });
    }

    if (parsedAgendaId !== null) {
      const asignacion = await prisma.agendaTecnico.findUnique({
        where: {
          agendaId_tecnicoId: {
            agendaId: parsedAgendaId,
            tecnicoId,
          },
        },
        select: { agendaId: true },
      });

      if (!asignacion) {
        return res.status(403).json({ error: "La visita no esta asignada a este tecnico" });
      }
    }

    const ubicacion = await prisma.ubicacionTecnico.create({
      data: {
        tecnicoId,
        agendaId: parsedAgendaId,
        latitud: lat,
        longitud: lon,
        precision: parsedPrecision,
        velocidad: parsedVelocidad,
        estadoTracking: typeof estadoTracking === "string" && estadoTracking.trim()
          ? estadoTracking.trim().slice(0, 40)
          : "EN_RUTA",
      },
      select: {
        id: true,
        tecnicoId: true,
        agendaId: true,
        latitud: true,
        longitud: true,
        precision: true,
        velocidad: true,
        estadoTracking: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ ubicacion });
  } catch (error: any) {
    console.error("Error al registrar ubicación:", error);
    return res.status(500).json({
      error: `Error interno al registrar ubicación: ${error.message || error}`,
    });
  }
};

const visitaInicialSelect = {
  id_visita: true,
  empresaId: true,
  tecnicoId: true,
  sucursalId: true,
  inicio: true,
  status: true,
  direccion_visita: true,
  agendaId: true,
  origen: true,
} satisfies Prisma.VisitaSelect;

function coordenadasVisita(latitud: unknown, longitud: unknown) {
  return latitud && longitud ? `${latitud},${longitud}` : null;
}

function parseOptionalInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

async function crearVisitaInicial(params: {
  empresaId: number;
  tecnicoId: number;
  sucursalId: number | null;
  latitud?: unknown;
  longitud?: unknown;
  inicio?: unknown;
  agendaId?: number | null;
  origen: OrigenVisita;
}) {
  return prisma.visita.create({
    data: {
      empresaId: params.empresaId,
      tecnicoId: params.tecnicoId,
      sucursalId: params.sucursalId,
      solicitante: "No especificado",
      inicio: parseDateOrNow(params.inicio),
      status: EstadoVisita.PENDIENTE,
      direccion_visita: coordenadasVisita(params.latitud, params.longitud),
      agendaId: params.agendaId ?? null,
      origen: params.origen,
    },
    select: visitaInicialSelect,
  });
}

export const crearVisita = async (req: Request, res: Response) => {
  try {
    console.log("Datos recibidos para crear la visita:", req.body);
    const { empresaId, tecnicoId, sucursalId, latitud, longitud, inicio, agendaId } = req.body ?? {};
    const parsedAgendaId = parseOptionalInt(agendaId);

    if (Number.isNaN(parsedAgendaId)) {
      return res.status(400).json({ error: "agendaId inválido" });
    }

    if (parsedAgendaId !== null) {
      const tecnicoAutenticadoId = req.user?.id;
      if (!tecnicoAutenticadoId) return res.status(401).json({ error: "No autenticado" });

      const empresaIdInt = Number(empresaId);
      const sucursalIdInt = parseOptionalInt(sucursalId);

      if (!Number.isInteger(empresaIdInt)) {
        return res.status(400).json({ error: "empresaId es obligatorio y debe ser válido" });
      }

      if (Number.isNaN(sucursalIdInt)) {
        return res.status(400).json({ error: "sucursalId inválido" });
      }

      const agenda = await prisma.agendaVisita.findUnique({
        where: { id: parsedAgendaId },
        select: {
          id: true,
          empresaId: true,
          estado: true,
        },
      });

      if (!agenda) {
        return res.status(404).json({ error: "Agenda no encontrada" });
      }

      const asignacion = await prisma.agendaTecnico.findUnique({
        where: {
          agendaId_tecnicoId: {
            agendaId: parsedAgendaId,
            tecnicoId: tecnicoAutenticadoId,
          },
        },
        select: { agendaId: true },
      });

      if (!asignacion) {
        return res.status(403).json({ error: "La agenda no pertenece al técnico autenticado" });
      }

      if (agenda.estado !== EstadoAgenda.INICIADA) {
        return res.status(409).json({ error: "La agenda debe estar iniciada para crear el formulario de visita" });
      }

      if (!agenda.empresaId) {
        return res.status(409).json({ error: "La agenda no tiene una empresa definida" });
      }

      if (agenda.empresaId !== empresaIdInt) {
        return res.status(409).json({ error: "La empresa enviada no coincide con la empresa de la agenda" });
      }

      const existente = await prisma.visita.findUnique({
        where: { agendaId: parsedAgendaId },
        select: visitaInicialSelect,
      });

      if (existente) {
        return res.status(200).json({ visita: existente, reutilizada: true });
      }

      let nuevaVisita;
      try {
        nuevaVisita = await crearVisitaInicial({
          empresaId: agenda.empresaId,
          tecnicoId: tecnicoAutenticadoId,
          sucursalId: sucursalIdInt,
          latitud,
          longitud,
          inicio,
          agendaId: agenda.id,
          origen: OrigenVisita.AGENDA,
        });
      } catch (error: any) {
        if (error?.code === "P2002") {
          const visitaReutilizada = await prisma.visita.findUnique({
            where: { agendaId: parsedAgendaId },
            select: visitaInicialSelect,
          });

          if (visitaReutilizada) {
            return res.status(200).json({ visita: visitaReutilizada, reutilizada: true });
          }
        }

        throw error;
      }

      return res.status(201).json({ visita: nuevaVisita, reutilizada: false });
    }

    if (!empresaId || !tecnicoId) {
      return res.status(400).json({ error: "empresaId y tecnicoId son obligatorios" });
    }

    const empresaIdInt = Number(empresaId);
    const tecnicoIdInt = Number(tecnicoId);
    const sucursalIdInt = parseOptionalInt(sucursalId);

    if (isNaN(empresaIdInt) || isNaN(tecnicoIdInt) || Number.isNaN(sucursalIdInt)) {
      return res.status(400).json({ error: "Los IDs deben ser números válidos" });
    }

    const nuevaVisita = await crearVisitaInicial({
      empresaId: empresaIdInt,
      tecnicoId: tecnicoIdInt,
      sucursalId: sucursalIdInt,
      latitud,
      longitud,
      inicio,
      agendaId: null,
      origen: OrigenVisita.MANUAL,
    });

    return res.status(201).json({ visita: nuevaVisita });

  } catch (error: any) {
    console.error('Error al crear la visita:', error);
    return res.status(500).json({ error: `Error interno al crear la visita: ${error.message || error}` });
  }
};

export const cancelarVisita = async (req: Request, res: Response) => {
  try {
    const visitaId = Number(req.params.id);
    if (!Number.isFinite(visitaId)) {
      return res.status(400).json({ error: "ID de visita inválido" });
    }

    const visita = await prisma.visita.findUnique({
      where: { id_visita: visitaId },
      select: { id_visita: true, status: true },
    });

    if (!visita) return res.status(404).json({ error: "Visita no encontrada" });

    if (visita.status === EstadoVisita.COMPLETADA) {
      return res.status(409).json({ error: "No se puede cancelar una visita completada" });
    }

    const eliminada = await prisma.visita.delete({
      where: { id_visita: visitaId },
      select: {
        id_visita: true,
        status: true,
        inicio: true,
      },
    });

    return res.status(200).json({ visita: eliminada });
  } catch (error: any) {
    console.error("Error al cancelar visita:", error);
    return res.status(500).json({
      error: `Error interno al cancelar la visita: ${error.message || error}`,
    });
  }
};

export const completarVisita = async (req: Request, res: Response) => {
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
        agendaId: true,
        origen: true,
      },
    });

    if (!v) return res.status(404).json({ error: "Visita no encontrada" });

    const {
      confImpresoras, confTelefonos, confPiePagina, otros, otrosDetalle,
      ccleaner, actualizaciones, antivirus, estadoDisco,
      licenciaWindows, licenciaOffice, rendimientoEquipo, mantenimientoReloj, ecografo,
      realizado,
      solicitantes,
      direccion_visita
    } = req.body ?? {};

    // Normalizar booleanos
    const toB = (x: any) => Boolean(x);
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

    let otrosDetalleValidado: string | null = null;
    if (payloadFlags.otros) {
      const t = (otrosDetalle ?? '').toString().trim();
      if (!t) return res.status(400).json({ error: "'otrosDetalle' no puede estar vacío si 'otros' está marcado" });
      otrosDetalleValidado = t;
    }

    // Validar solicitantes
    const arr = Array.isArray(solicitantes) ? solicitantes : [];
    const ids = arr.map(s => Number(s?.id_solicitante)).filter(n => Number.isFinite(n)) as number[];
    const names = arr.map(s => (s?.nombre ?? '').toString().trim());

    if (!ids.length) return res.status(400).json({ error: "Debe venir al menos un solicitante" });

    const now = new Date();
    const visitStart = v.inicio;
    const totalMs = Math.max(0, now.getTime() - visitStart.getTime());
    const getSolicitanteSlot = (index: number) => {
      const startOffset = Math.round((totalMs * index) / ids.length);
      const endOffset = Math.round((totalMs * (index + 1)) / ids.length);

      return {
        inicio: new Date(visitStart.getTime() + startOffset),
        fin: index === ids.length - 1 ? now : new Date(visitStart.getTime() + endOffset),
      };
    };

    const result = await prisma.$transaction(async (tx) => {
      const updated: any[] = [];
      const firstSlot = getSolicitanteSlot(0);

      // 1️⃣ Actualizar la visita existente (primer solicitante)
      const u = await tx.visita.update({
        where: { id_visita: visitaId },
        data: {
          ...payloadFlags,
          otrosDetalle: otrosDetalleValidado,
          inicio: firstSlot.inicio,
          solicitanteId: ids[0],
          solicitante: names[0] || null,
          fin: firstSlot.fin,
          status: EstadoVisita.COMPLETADA,
          direccion_visita: direccion_visita || v.direccion_visita,
          sucursalId: req.body.sucursalId ?? v.sucursalId ?? null,
        },
        select: {
          id_visita: true, tecnicoId: true, empresaId: true, inicio: true, fin: true,
          solicitanteId: true, solicitante: true, status: true,
          ccleaner: true, actualizaciones: true, antivirus: true, estadoDisco: true,
          licenciaWindows: true, licenciaOffice: true, rendimientoEquipo: true, mantenimientoReloj: true, ecografo: true,
          direccion_visita: true, sucursalId: true, agendaId: true, origen: true,
        },
      });

      updated.push(u);

      // 2️⃣ Crear historial correspondiente
      await tx.historial.create({
        data: {
          tecnicoId: u.tecnicoId,
          empresaId: u.empresaId,
          solicitanteId: u.solicitanteId!,
          solicitante: u.solicitante,
          inicio: u.inicio,
          fin: u.fin!,
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
        const slot = getSolicitanteSlot(i);
        const nueva = await tx.visita.create({
          data: {
            tecnicoId: u.tecnicoId,
            empresaId: u.empresaId,
            inicio: slot.inicio,
            fin: slot.fin,
            status: EstadoVisita.COMPLETADA,
            ...payloadFlags,
            otrosDetalle: otrosDetalleValidado,
            solicitanteId: ids[i],
            solicitante: names[i] || null,
            direccion_visita: direccion_visita || v.direccion_visita,
            sucursalId: req.body.sucursalId ?? v.sucursalId ?? null,
            agendaId: null,
            origen: v.origen,
          },
          select: {
            id_visita: true, tecnicoId: true, empresaId: true, inicio: true, fin: true,
            solicitanteId: true, solicitante: true, status: true,
            ccleaner: true, actualizaciones: true, antivirus: true, estadoDisco: true,
            licenciaWindows: true, licenciaOffice: true, rendimientoEquipo: true, mantenimientoReloj: true, ecografo: true,
            direccion_visita: true, sucursalId: true, agendaId: true, origen: true,
          },
        });

        updated.push(nueva);

        await tx.historial.create({
          data: {
            tecnicoId: nueva.tecnicoId,
            empresaId: nueva.empresaId,
            solicitanteId: nueva.solicitanteId!,
            solicitante: nueva.solicitante,
            inicio: nueva.inicio,
            fin: nueva.fin!,
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

  } catch (error: any) {
    console.error("Error al completar visita:", error);
    return res.status(500).json({
      error: `Error interno al completar la visita: ${error.message || error}`,
    });
  }
};

// GET /api/historial/:tecnicoId / Aceptar datos Null
// GET /api/historial/:tecnicoId?page=1&limit=10  - CON MANEJO DE SUCURSAL NULL + PAGINACIÓN
// GET /api/historial
export const obtenerHistorialPorTecnico = async (req: Request, res: Response) => {
  const tecnicoId = (req as any).user?.id;

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

  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
    return res.status(500).json({ error: "Error consultando historial" });
  }
};

//Carga masiva de solicitantes por empresa
export const createManySolicitante = async (req: Request, res: Response) => {
  const { solicitantes } = req.body;

  if (!Array.isArray(solicitantes) || solicitantes.length === 0) {
    return res.status(400).json({ error: 'Debes enviar un arreglo de solicitantes' });
  }

  try {
    const result = await prisma.solicitante.createMany({
      data: solicitantes.map((s: { nombre: string; empresaId: number }) => ({
        nombre: s.nombre,
        empresaId: s.empresaId
      })),
      skipDuplicates: true, // evita error si ya existe uno con mismos datos únicos
    });

    return res.status(201).json({
      message: `Se agregaron ${result.count} solicitante(s)`,
    });
  } catch (error: any) {
    console.error('Error al insertar solicitantes:', error);
    return res.status(500).json({ error: 'Error al insertar solicitantes' });
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

//GET /api/auth/getSolicitante
export const getSolicitantes = async (req: Request, res: Response) => {
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
        rut: true,
        empresaId: true,
      },
    });

    return res.json({ solicitantes });
  } catch (error) {
    console.error("Error al obtener solicitantes:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};


export const updateSolicitante = async (req: Request, res: Response) => {
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
      } catch (error) {
        console.error("Error al actualizar solicitante con ID:", id_solicitante, error);
        return res.status(500).json({ error: `Error al actualizar solicitante con ID ${id_solicitante}` });
      }
    }

    return res.json({
      message: "Solicitantes actualizados correctamente",
      updatedSolicitantes,
    });
  } catch (error) {
    console.error("Error en el proceso de actualización de solicitantes:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

//GET Auth/getAllEquipos
export const getAllEquipos = async (req: Request, res: Response) => {
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

    equiposMap.forEach(eq => delete (eq as any).equipo);

    return res.json({ equipos: equiposMap });
  } catch (e) {
    console.error('Error al obtener equipos', e);
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
    if (typeof vPropiedad !== "undefined") dataEquipo.propiedad = vPropiedad;

    const detalleData: Record<string, string | null | undefined> = {
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
    const dataDetalle = Object.fromEntries(
      Object.entries(detalleData).filter(([, value]) => typeof value !== "undefined"),
    ) as Record<string, string | null>;

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
        } else {
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
  } catch (e: any) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
      const fields = (e as Prisma.PrismaClientKnownRequestError).meta?.target;
      return res.status(409).json({ error: `Ya existe un equipo con ese valor único (${fields})` });
    }
    if (e?.code === "P2025") return res.status(404).json({ error: "Equipo no encontrado" });
    console.error("Error al actualizar equipo:", e);
    return res.status(500).json({ error: "Error al actualizar equipo" });
  }
};

// PUT /auth/equipos/:id/solicitante
export const cambiarSolicitanteEquipo = async (req: Request, res: Response) => {
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

  } catch (error) {
    console.error("[CAMBIAR_SOLICITANTE_EQUIPO]", error);
    return res.status(500).json({ error: "Error interno al cambiar solicitante" });
  }
};

type DetalleEquipoBody = {
  idEquipo: number;          // <- PRIMITIVO, no "Number"
  macWifi: string;
  redEthernet?: string;
  so: string;
  tipoDd: string;
  estadoAlm: string;
  office: string;
  teamViewer: string;
  claveTv: string;
  revisado: string;          // cámbialo a boolean o enum si en tu schema no es string
  adminRidsUsuario?: string;
  adminRidsPassword?: string;
  usuarioEmpresa?: string;
  passwordEmpresa?: string;
  usuarioPersonal?: string;
  passwordPersonal?: string;
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


type EquipoInput = {
  idSolicitante: number;
  serial: string;
  marca: string;
  modelo: string;
  procesador: string;
  ram: string;
  disco: string;
  propiedad: string;
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
      return res.status(409).json({ error: `Ya existe un equipo con ese valor único (${fields})` });
    }
    console.error('Error al crear equipo:', error);
    return res.status(500).json({ error: 'Error al crear equipo' });
  }
};

// POST /auth/createSolicitante 
export const createSolicitante = async (req: Request, res: Response) => {
  try {
    const { nombre, empresaId, email, telefono, clienteId } = req.body;

    // Validaciones mínimas
    if (!nombre?.trim() || !empresaId) {
      return res.status(400).json({
        error: "El nombre y empresaId son obligatorios"
      });
    }

    // Preparar datos para crear
    const data: any = {
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

  } catch (error: any) {
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

// Method Sucursales
// POST /api/sucursales
export const crearSucursal = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error al crear sucursal:', error);
    return res.status(500).json({ error: 'Error interno al crear sucursal' });
  }
};

// GET /api/empresas/:id/sucursales
export const obtenerSucursalesPorEmpresa = async (req: Request, res: Response) => {
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

  } catch (error) {
    console.error('Error al obtener sucursales:', error);
    return res.status(500).json({ error: 'Error interno al obtener sucursales' });
  }
};

// GET /api/empresasConSucursales
export const obtenerEmpresasConSucursales = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error al obtener empresas con sucursales:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
