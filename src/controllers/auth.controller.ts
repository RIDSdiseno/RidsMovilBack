import type { Request, Response } from "express";
import { EstadoVisita, Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Secret } from "jsonwebtoken";
import crypto from "crypto";
import { error } from "console";

const prisma = new PrismaClient
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
    });
    return res.json(clientes);
  } catch (e) {
    console.error("Error al obtener categorias: ", JSON.stringify(e));
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

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });



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

// En tu backend - modificar la función crearVisita
export const crearVisita = async (req: Request, res: Response) => {
  try {
    console.log("Datos recibidos para crear la visita:", req.body);
    const { empresaId, tecnicoId, latitud, longitud } = req.body;

    if (!empresaId || !tecnicoId) {
      return res.status(400).json({ error: "empresaId y tecnicoId son obligatorios" });
    }

    const empresaIdInt = Number(empresaId);
    const tecnicoIdInt = Number(tecnicoId);

    if (isNaN(empresaIdInt) || isNaN(tecnicoIdInt)) {
      return res.status(400).json({ error: "Los IDs deben ser números válidos" });
    }

    // Guardar coordenadas en formato string "lat,lon"
    const coordenadas = latitud && longitud ? `${latitud},${longitud}` : null;

    const nuevaVisita = await prisma.visita.create({
      data: {
        empresaId: empresaIdInt,
        tecnicoId: tecnicoIdInt,
        solicitante: 'No especificado',
        inicio: new Date(),
        status: EstadoVisita.PENDIENTE,
        direccion_visita: coordenadas // ← Ahora guarda solo coordenadas
      },
      select: {
        id_visita: true,
        empresaId: true,
        tecnicoId: true,
        inicio: true,
        status: true,
        direccion_visita: true
      }
    });

    return res.status(201).json({ visita: nuevaVisita });

  } catch (error: any) {
    console.error('Error al crear la visita:', error);
    return res.status(500).json({ error: `Error interno al crear la visita: ${error.message || error}` });
  }
};

export const completarVisita = async (req: Request, res: Response) => {
  try {
    const visitaId = Number(req.params.id);
    if (!Number.isFinite(visitaId)) return res.status(400).json({ error: "ID de visita inválido" });

    const v = await prisma.visita.findUnique({ where: { id_visita: visitaId } });
    if (!v) return res.status(404).json({ error: "Visita no encontrada" });

    const {
      confImpresoras, confTelefonos, confPiePagina, otros, otrosDetalle,
      ccleaner, actualizaciones, antivirus, estadoDisco,
      licenciaWindows, licenciaOffice, rendimientoEquipo, mantenimientoReloj, ecografo,
      realizado,
      solicitantes,
      direccion_visita // ✅ Recibir dirección del body
    } = req.body ?? {};

    // Normalizar booleans
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

    // Normalizar solicitantes
    const arr = Array.isArray(solicitantes) ? solicitantes : [];
    const ids = arr.map(s => Number(s?.id_solicitante)).filter(n => Number.isFinite(n)) as number[];
    const names = arr.map(s => (s?.nombre ?? '').toString().trim());

    if (!ids.length) return res.status(400).json({ error: "Debe venir al menos un solicitante" });

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updated: any[] = [];

      // 1) actualizar la visita existente con el primer solicitante
      const u = await tx.visita.update({
        where: { id_visita: visitaId },
        data: {
          ...payloadFlags,
          otrosDetalle: otrosDetalleValidado,
          solicitanteId: ids[0],
          solicitante: names[0] || null,
          fin: now,
          status: EstadoVisita.COMPLETADA,
          direccion_visita: direccion_visita || v.direccion_visita // ✅ Usar nueva dirección o mantener existente
        },
        select: {
          id_visita: true, tecnicoId: true, empresaId: true, inicio: true, fin: true,
          solicitanteId: true, solicitante: true, status: true,
          ccleaner: true, actualizaciones: true, antivirus: true, estadoDisco: true,
          licenciaWindows: true, licenciaOffice: true, rendimientoEquipo: true, mantenimientoReloj: true, ecografo: true,
          direccion_visita: true // ✅ Incluir dirección en select
        }
      });
      updated.push(u);

      // ❌ ERROR CORREGIDO: Cambiar `direccion_visita: true` por `direccion_visita: u.direccion_visita`
      await tx.historial.create({
        data: {
          tecnicoId: u.tecnicoId,
          solicitanteId: u.solicitanteId!,
          solicitante: u.solicitante,
          inicio: u.inicio,
          fin: u.fin!,
          realizado: (realizado ?? otrosDetalleValidado) ?? null,
          ccleaner: u.ccleaner,
          actualizaciones: u.actualizaciones,
          antivirus: u.antivirus,
          estadoDisco: u.estadoDisco,
          licenciaWindows: u.licenciaWindows,
          licenciaOffice: u.licenciaOffice,
          rendimientoEquipo: u.rendimientoEquipo,
          mantenimientoReloj: u.mantenimientoReloj,
          ecografo: u.ecografo,
          direccion_visita: u.direccion_visita // ✅ CORREGIDO: usar el valor real
        }
      });

      // 2) crear visitas nuevas para el resto de solicitantes
      for (let i = 1; i < ids.length; i++) {
        const nueva = await tx.visita.create({
          data: {
            tecnicoId: u.tecnicoId,
            empresaId: u.empresaId,
            inicio: v.inicio,
            fin: now,
            status: EstadoVisita.COMPLETADA,
            ...payloadFlags,
            otrosDetalle: otrosDetalleValidado,
            solicitanteId: ids[i],
            solicitante: names[i] || null,
            direccion_visita: direccion_visita || v.direccion_visita // ✅ Agregar dirección también aquí
          },
          select: {
            id_visita: true, tecnicoId: true, empresaId: true, inicio: true, fin: true,
            solicitanteId: true, solicitante: true, status: true,
            ccleaner: true, actualizaciones: true, antivirus: true, estadoDisco: true,
            licenciaWindows: true, licenciaOffice: true, rendimientoEquipo: true, mantenimientoReloj: true, ecografo: true,
            direccion_visita: true // ✅ Incluir dirección en select
          }
        });

        updated.push(nueva);

        // ❌ ERROR CORREGIDO: Cambiar `direccion_visita: true` por `direccion_visita: nueva.direccion_visita`
        await tx.historial.create({
          data: {
            tecnicoId: nueva.tecnicoId,
            solicitanteId: nueva.solicitanteId!,
            solicitante: nueva.solicitante,
            inicio: nueva.inicio,
            fin: nueva.fin!,
            realizado: (realizado ?? otrosDetalleValidado) ?? null,
            ccleaner: nueva.ccleaner,
            actualizaciones: nueva.actualizaciones,
            antivirus: nueva.antivirus,
            estadoDisco: nueva.estadoDisco,
            licenciaWindows: nueva.licenciaWindows,
            licenciaOffice: nueva.licenciaOffice,
            rendimientoEquipo: nueva.rendimientoEquipo,
            mantenimientoReloj: nueva.mantenimientoReloj,
            ecografo: nueva.ecografo,
            direccion_visita: nueva.direccion_visita // ✅ CORREGIDO: usar el valor real
          }
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
    return res.status(500).json({ error: `Error interno al completar la visita: ${error.message || error}` });
  }
};

// GET /api/historial/:tecnicoId / Aceptar datos Null
export const obtenerHistorialPorTecnico = async (req: Request, res: Response) => {
  const tecnicoId = Number(req.params.id);
  if (Number.isNaN(tecnicoId)) {
    return res.status(400).json({ error: 'ID de técnico inválido' });
  }

  try {
    const historial = await prisma.historial.findMany({
      where: { tecnicoId },
      orderBy: { fin: 'desc' },
      select: {
        id: true,
        inicio: true,
        fin: true,
        realizado: true,
        direccion_visita: true,
        solicitanteRef: {
          select: {
            nombre: true,
            empresa: {
              select: {
                id_empresa: true,
                nombre: true,
              },
            },
          },
        },
      },
    });

    // Mapeo seguro para evitar errores por relaciones nulas
    const safe = historial.map((h) => ({
      ...h,
      nombreCliente: h?.solicitanteRef?.empresa?.nombre ?? 'Empresa desconocida',
      nombreSolicitante: h?.solicitanteRef?.nombre ?? 'Solicitante no asignado',
    }));

    return res.json({ historial: safe });
  } catch (err: any) {
    console.error('[HISTORIAL] Error:', err);
    return res.status(500).json({
      message: 'Error consultando historial',
      name: err?.name,
      code: err?.code,
      meta: err?.meta,
    });
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
    equiposMap.forEach(eq => delete (eq as any).equipo);

    return res.json({ equipos: equiposMap });
  } catch (e) {
    console.error("Error al obtener equipos", e);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};


export const actualizarEquipo = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    // Aceptar ahora estas 4 llaves
    const { disco, procesador, ram, tipoDd } = req.body ?? {};
    const keys = Object.keys(req.body || {});
    const allowed = new Set(["disco", "procesador", "ram", "tipoDd"]);
    const extras = keys.filter(k => !allowed.has(k));
    if (extras.length) {
      return res.status(400).json({ error: `Campos no permitidos: ${extras.join(", ")}` });
    }
    if (
      typeof disco === "undefined" &&
      typeof procesador === "undefined" &&
      typeof ram === "undefined" &&
      typeof tipoDd === "undefined"
    ) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const norm = (v: any): string | undefined => {
      if (typeof v === "undefined") return undefined;
      return String(v).trim();
    };

    // Verifica que el equipo exista (importante si solo viene tipoDd)
    const existe = await prisma.equipo.findUnique({
      where: { id_equipo: id },
      select: { id_equipo: true }
    });
    if (!existe) return res.status(404).json({ error: "Equipo no encontrado" });

    const dataEquipo: Prisma.EquipoUpdateInput = {};
    const vDisco = norm(disco);
    const vProc = norm(procesador);
    const vRam = norm(ram);
    const vTipo = norm(tipoDd);

    if (typeof vDisco !== "undefined") dataEquipo.disco = vDisco;
    if (typeof vProc !== "undefined") dataEquipo.procesador = vProc;
    if (typeof vRam !== "undefined") dataEquipo.ram = vRam;

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
      let detalle: { id: number; tipoDd: string | null } | null = null;

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
        } else {
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
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ error: "Equipo no encontrado" });
    console.error("Error al actualizar equipo:", e);
    return res.status(500).json({ error: "Error al actualizar equipo" });
  }
};


type DetalleEquipoBody = {
  idEquipo: number;          // <- PRIMITIVO, no "Number"
  macWifi: string;
  so: string;
  tipoDd: string;
  estadoAlm: string;
  office: string;
  teamViewer: string;
  claveTv: string;
  revisado: string;          // cámbialo a boolean o enum si en tu schema no es string
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
      include: {
        solicitantes: {
          select: { id_solicitante: true, nombre: true, email: true },
        },
      },
    });

    if (sucursales.length === 0) {
      return res.status(404).json({ message: 'Esta empresa no tiene sucursales registradas' });
    }

    return res.json({ sucursales });
  } catch (error) {
    console.error('Error al obtener sucursales:', error);
    return res.status(500).json({ error: 'Error interno al obtener sucursales' });
  }
};

// POST /api/asignarSolicitanteSucursal
export const asignarSolicitanteSucursal = async (req: Request, res: Response) => {
  const { solicitanteId, sucursalId } = req.body;

  if (!solicitanteId || !sucursalId) {
    return res.status(400).json({ error: 'Debe indicar solicitanteId y sucursalId' });
  }

  try {
    // Verificar que la sucursal exista
    const sucursal = await prisma.sucursal.findUnique({
      where: { id_sucursal: sucursalId },
    });

    if (!sucursal) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    // Actualizar relación del solicitante
    const actualizado = await prisma.solicitante.update({
      where: { id_solicitante: solicitanteId },
      data: { sucursalId },
      include: { sucursal: true, empresa: true },
    });

    return res.json({
      message: 'Solicitante asignado a sucursal correctamente',
      solicitante: actualizado,
    });
  } catch (error) {
    console.error('Error al asignar solicitante a sucursal:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
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