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
const ACCESS_EXPIRES_SEC = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 15 * 60); // 15 min

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


export const crearVisita = async (req: Request, res: Response) => {
  try {
    console.log("Datos recibidos para crear la visita:", req.body);
    const { empresaId, tecnicoId } = req.body;

    // Validación básica
    if (!empresaId || !tecnicoId) {
      console.log(empresaId, tecnicoId)
      return res.status(400).json({ error: "empresaId y tecnicoId son obligatorios" });
    }

    // Convertir 'empresaId' y 'tecnicoId' a números (en caso de que se pasen como cadenas)
    const empresaIdInt = Number(empresaId);
    const tecnicoIdInt = Number(tecnicoId);

    // Verificar que 'empresaId' y 'tecnicoId' sean números válidos
    if (isNaN(empresaIdInt) || isNaN(tecnicoIdInt)) {
      return res.status(400).json({ error: "Los IDs deben ser números válidos" });
    }

    // Crear la visita sin incluir los campos 'realizado' y 'solicitante' durante la creación
    const nuevaVisita = await prisma.visita.create({
      data: {
        empresaId: empresaIdInt,  // Usar 'empresaId' como número
        tecnicoId: tecnicoIdInt,  // Usar 'tecnicoId' como número
        solicitante: 'No especificado', // 'solicitante' se deja vacío inicialmente
        inicio: new Date(),
        status: EstadoVisita.PENDIENTE,  // 'fin' no se incluye en la creación
      },
      select: {
        id_visita: true,
        empresaId: true,
        tecnicoId: true,
        inicio: true,
        fin: false,
        status: true
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
    console.log("Datos recibidos para completar la visita:", req.body);
    const visitaId = Number(req.params.id);

    const {
      confImpresoras,
      confTelefonos,
      confPiePagina,
      otros,
      otrosDetalle,
      solicitante,  // Este es el nombre o identificador del solicitante
      ccleaner,
      actualizaciones,
      antivirus,
      estadoDisco,
      licenciaWindows,
      licenciaOffice,
      rendimientoEquipo,
      mantenimientoReloj
    } = req.body;

    if (isNaN(visitaId)) {
      return res.status(400).json({ error: "ID de visita inválido" });
    }

    const visitaExistente = await prisma.visita.findUnique({
      where: { id_visita: visitaId },
    });

    if (!visitaExistente) {
      return res.status(404).json({ error: "Visita no encontrada" });
    }

    // Convertir los campos booleanos
    const confImpresorasBool = Boolean(confImpresoras);
    const confTelefonosBool = Boolean(confTelefonos);
    const confPiePaginaBool = Boolean(confPiePagina);
    const otrosBool = Boolean(otros);
    const ccleanerBool = Boolean(ccleaner);
    const actualizacionesBool = Boolean(actualizaciones);
    const antivirusBool = Boolean(antivirus);
    const estadoDiscoBool = Boolean(estadoDisco);
    const licenciaWindowsBool = Boolean(licenciaWindows);
    const licenciaOfficeBool = Boolean(licenciaOffice);
    const rendimientoEquipoBool = Boolean(rendimientoEquipo);
    const mantenimientoRelojBool = Boolean(mantenimientoReloj);

    let otrosDetalleValidado = null;
    if (otrosBool && otrosDetalle) {
      otrosDetalleValidado = otrosDetalle?.trim();
      if (!otrosDetalleValidado) {
        return res.status(400).json({ error: "'otrosDetalle' no puede estar vacío si 'otros' está seleccionado" });
      }
    }

    // 1. Buscar el ID del solicitante (si no lo hemos recibido directamente como ID, buscarlo por nombre)
    let solicitanteId: number | undefined = undefined;

    if (solicitante) {
      const solicitanteEncontrado = await prisma.solicitante.findFirst({
        where: {
          nombre: solicitante.trim()  // Usar el nombre directamente aquí
        },
        select: { id_solicitante: true }
      });

      if (solicitanteEncontrado) {
        solicitanteId = solicitanteEncontrado.id_solicitante;
      } else {
        return res.status(400).json({ error: "Solicitante no encontrado" });
      }
    }

    // 2. Actualizar la visita con los nuevos datos
    const visitaActualizada = await prisma.visita.update({
      where: { id_visita: visitaId },
      data: {
        confImpresoras: confImpresorasBool,
        confTelefonos: confTelefonosBool,
        confPiePagina: confPiePaginaBool,
        otros: otrosBool,
        otrosDetalle: otrosDetalleValidado,
        solicitanteId,
        solicitante,  // Usamos 'undefined' si no se encontró el solicitante
        ccleaner: ccleanerBool,
        actualizaciones: actualizacionesBool,
        antivirus: antivirusBool,
        estadoDisco: estadoDiscoBool,
        licenciaWindows: licenciaWindowsBool,
        licenciaOffice: licenciaOfficeBool,
        rendimientoEquipo: rendimientoEquipoBool,
        mantenimientoReloj: mantenimientoRelojBool,
        fin: new Date(),
        status: EstadoVisita.COMPLETADA,
      },
      select: {
        id_visita: true,
        tecnicoId: true,
        solicitanteId: true,
        solicitante: true,
        inicio: true,
        fin: true,
        status: true,
        ccleaner: true,
        actualizaciones: true,
        antivirus: true,
        estadoDisco: true,
        licenciaWindows: true,
        licenciaOffice: true,
        rendimientoEquipo: true,
        mantenimientoReloj: true,
      }
    });

    // 3. Crear historial con los datos actualizados
    await prisma.historial.create({
      data: {
        tecnicoId: visitaActualizada.tecnicoId,
        solicitanteId: visitaActualizada.solicitanteId!,  // Usamos solicitanteId aquí
        solicitante: visitaActualizada.solicitante,  // El nombre del solicitante, si lo necesitas
        inicio: visitaActualizada.inicio,
        fin: visitaActualizada.fin!, // Aseguramos que no sea null
        realizado: otrosDetalle,
        ccleaner: visitaActualizada.ccleaner,
        actualizaciones: visitaActualizada.actualizaciones,
        antivirus: visitaActualizada.antivirus,
        estadoDisco: visitaActualizada.estadoDisco,
        licenciaWindows: visitaActualizada.licenciaWindows,
        licenciaOffice: visitaActualizada.licenciaOffice,
        rendimientoEquipo: visitaActualizada.rendimientoEquipo,
        mantenimientoReloj: visitaActualizada.mantenimientoReloj,
      }
    });

    return res.status(200).json({
      message: "Visita completada y registrada en historial",
      visita: visitaActualizada,
    });

  } catch (error: any) {
    console.error("Error al completar visita:", error);
    return res.status(500).json({ error: `Error interno al completar la visita: ${error.message || error}` });
  }
};

// GET /api/historial/:tecnicoId
export const obtenerHistorialPorTecnico = async (req: Request, res: Response) => {
  const tecnicoId = Number(req.params.id);

  // Validar si el ID del técnico es válido
  if (isNaN(tecnicoId)) {
    return res.status(400).json({ error: "ID de técnico inválido" });
  }

  try {
    // Obtener historial con la relación solicitante y la empresa de cada solicitante
    const historial = await prisma.historial.findMany({
      where: {
        tecnicoId: tecnicoId  // Filtrar por el ID del técnico
      },
      orderBy: {
        fin: 'desc'  // Ordenar por fecha de fin, de más reciente a más antiguo
      },
      include: {
        solicitanteRef: {  // Aquí usamos 'cliente' ya que es el nombre de la relación en el modelo
          include: {
            empresa: true  // Incluir la empresa asociada al solicitante
          }
        }
      }
    });

    // Retornar el historial con la información adicional de la empresa
    return res.json({ historial });
  } catch (error) {
    console.error("Error al obtener historial:", error);
    return res.status(500).json({ error: "Error interno al obtener el historial" });
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

      if (emailExistente) {
        return res.status(400).json({ error: `El email ${email} ya está en uso por otro solicitante.` });
      }

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

// Exportar actualizarEquipo fuera de getSolicitantes
export const actualizarEquipo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { disco, procesador, ram } = req.body;

  try {
    const equipoActualizado = await prisma.equipo.update({
      where: { id_equipo: Number(id) },
      data: {
        disco,
        procesador,
        ram,
      },
    });

    return res.status(200).json({
      message: "Equipo Actualizado",
      equipo: equipoActualizado,
    });

  } catch (error) {
    console.error("Error al actualizar equipo", error);
    return res.status(500).json({ error: "Error al actualizar equipo" });
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
      }
    });
    return res.json({ equipos });
  }
  catch (e) {
    console.error("Error al obtener equipos", JSON.stringify(e));
    return res.status(500).json({ error: "Error interno del servidor" })
  }



}
    return res.json({equipos});
}
catch(e){
  console.error("Error al obtener equipos", JSON.stringify(e));
  return res.status(500).json({error: "Error interno del servidor"})
}
}
export const actualizarEquipo = async (req: Request, res: Response) => {
  try {
    const equipoId = Number(req.params.id);
    if (Number.isNaN(equipoId)) {
      return res.status(400).json({ error: "ID de equipo inválido" });
    }

    // Verificar existencia para devolver 404 (y no un 500 genérico)
    const existe = await prisma.equipo.findUnique({
      where: { id_equipo: equipoId },
      select: { id_equipo: true },
    });
    if (!existe) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    // Tomar solo los campos permitidos y normalizarlos
    const { disco, procesador, ram } = req.body ?? {};

    if (
      typeof disco === "undefined" &&
      typeof procesador === "undefined" &&
      typeof ram === "undefined"
    ) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    // Construir el objeto data SOLO con los campos presentes.
    // Si llega string vacío => lo guardamos como null (para “borrar” el valor).
    const data: Prisma.EquipoUpdateInput = {};

    if (typeof disco !== "undefined") {
      const v = String(disco).trim();
      (data as any).disco = v.length ? v : null;
    }
    if (typeof procesador !== "undefined") {
      const v = String(procesador).trim();
      (data as any).procesador = v.length ? v : null;
    }
    if (typeof ram !== "undefined") {
      const v = String(ram).trim();
      (data as any).ram = v.length ? v : null;
    }

    const equipoActualizado = await prisma.equipo.update({
      where: { id_equipo: equipoId },
      data,
      select: {
        id_equipo: true,
        marca: true,
        modelo: true,
        serial: true,
        disco: true,
        procesador: true,
        ram: true,
      },
    });

    return res.status(200).json({
      message: "Equipo Actualizado",
      equipo: equipoActualizado,
    });
  } catch (error: any) {
    // Manejo específico por si alguien intenta actualizar un registro inexistente
    if (error?.code === "P2025") {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    console.error("Error al actualizar equipo:", error);
    return res.status(500).json({ error: "Error al actualizar equipo" });
  }
};